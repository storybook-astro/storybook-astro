import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import type { Integration as StorybookAstroIntegration } from '../integrations/base.ts';
import { resolveTestingIntegrationsForRoot } from './integration-config.ts';
import { resolveTestingProjectRoot } from './project-root.ts';
import { runWithWorkingDirectory } from './working-directory.ts';
import { getComponentModuleId, isAstroComponentFactory, isStorybookAstroClientStub } from './component-utils.ts';
import { ssrLoadModuleWithFsFallback } from '../lib/ssr-load-module-with-fs-fallback.ts';
import { separateStorySlots } from '../lib/separate-story-slots.ts';
import { reconstructProps, reconstructSlots } from '../lib/reconstruct-component-args.ts';
import { patchCreateAstroCompat } from '../astroRenderHandler.ts';
import { serializeAstroComponentMarkers } from '@storybook-astro/renderer/types';
import type { ComposedStory } from './types.ts';
import { renderViaTestingRendererDaemon } from './renderer-daemon.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let astroContainerPromise: Promise<any> | null = null;

const astroSsrViteServerPromises = new Map<string, Promise<ViteDevServer>>();

const astroSsrHandlerPromises = new Map<
  string,
  Promise<
    (data: {
      component: string;
      args?: Record<string, unknown>;
      slots?: Record<string, unknown>;
    }) => Promise<string>
  >
>();

const testingIntegrationsCache = new Map<string, StorybookAstroIntegration[]>();

function getTestingIntegrations(resolveFrom: string) {
  if (!testingIntegrationsCache.has(resolveFrom)) {
    testingIntegrationsCache.set(resolveFrom, resolveTestingIntegrationsForRoot(resolveFrom));
  }

  return testingIntegrationsCache.get(resolveFrom)!;
}

async function getAstroContainer() {
  if (!astroContainerPromise) {
    const { experimental_AstroContainer: AstroContainer } = await import('astro/container');

    astroContainerPromise = AstroContainer.create();
  }

  return astroContainerPromise;
}

async function getAstroSsrViteServer(resolveFrom: string) {
  if (!astroSsrViteServerPromises.has(resolveFrom)) {
    const { createViteServer } = await import('../viteStorybookAstroMiddlewarePlugin.ts');
    const integrations = getTestingIntegrations(resolveFrom);

    astroSsrViteServerPromises.set(
      resolveFrom,
      runWithWorkingDirectory(resolveFrom, () => createViteServer(integrations, resolveFrom))
    );
  }

  return astroSsrViteServerPromises.get(resolveFrom)!;
}

async function getAstroSsrHandler(resolveFrom: string) {
  if (!astroSsrHandlerPromises.has(resolveFrom)) {
    astroSsrHandlerPromises.set(resolveFrom, (async () => {
      const integrations = getTestingIntegrations(resolveFrom);
      const viteServer = await getAstroSsrViteServer(resolveFrom);
      const middlewareModulePath = fileURLToPath(new URL('../middleware', import.meta.url));
      const middleware = await runWithWorkingDirectory(resolveFrom, () =>
        viteServer.ssrLoadModule(middlewareModulePath, {
          fixStacktrace: true
        })
      );

      return middleware.handlerFactory(integrations, {
        loadModule: (id: string) =>
          ssrLoadModuleWithFsFallback(viteServer, id, {
            fixStacktrace: true
          })
      });
    })());
  }

  return astroSsrHandlerPromises.get(resolveFrom)!;
}

async function resolveAstroComponent(component: unknown, resolveFrom: string) {
  let resolvedComponent = component;

  if (!isAstroComponentFactory(resolvedComponent)) {
    throw new Error('Story meta.component must be an Astro component factory.');
  }

  if ('moduleId' in resolvedComponent && typeof resolvedComponent.moduleId === 'string') {
    const moduleId = resolvedComponent.moduleId;
    const normalizedModuleId = moduleId.split('?')[0].split('#')[0];

    try {
      const mod = await import(/* @vite-ignore */ normalizedModuleId) as Record<string, unknown>;

      if (isAstroComponentFactory(mod.default)) {
        resolvedComponent = mod.default;
      }
    } catch {
      // keep current component when direct module import is unavailable
    }

    if (isStorybookAstroClientStub(resolvedComponent)) {
      try {
        const viteServer = await getAstroSsrViteServer(resolveFrom);
        const mod = (await ssrLoadModuleWithFsFallback(viteServer, normalizedModuleId)) as Record<string, unknown>;

        if (isAstroComponentFactory(mod.default)) {
          resolvedComponent = mod.default;
        }
      } catch {
        // keep current component when SSR module loading is unavailable
      }
    }
  }

  return resolvedComponent;
}

function setRenderedHtml(html: string) {
  if (typeof document !== 'undefined') {
    document.body.innerHTML = html;
  }

  return html;
}

async function renderAstroComponentToDom(
  component: unknown,
  args: Record<string, unknown>,
  resolveFrom: string
) {
  const moduleId = getComponentModuleId(component);

  // Split slot content from props, then serialize any Astro component passed as
  // a prop or slot into a moduleId marker. The handler reconstructs each marker —
  // loading the real server component by moduleId — so a story can nest Astro
  // components without the unrenderable client stub leaking through.
  const { componentArgs, storySlots } = separateStorySlots(args);
  const serializedArgs = serializeAstroComponentMarkers(componentArgs) as Record<string, unknown>;
  const serializedSlots = serializeAstroComponentMarkers(storySlots) as Record<string, unknown>;

  if (moduleId) {
    try {
      // Fast path: reuse a single shared SSR daemon instead of spinning SSR in each worker.
      const html = await renderViaTestingRendererDaemon({
        resolveFrom,
        component: moduleId,
        args: serializedArgs,
        slots: serializedSlots
      });

      if (typeof html === 'string') {
        return setRenderedHtml(html);
      }
    } catch {
      // Fall back to in-worker rendering below when daemon render fails.
    }

    try {
      const handler = await getAstroSsrHandler(resolveFrom);
      const html = await handler({
        component: moduleId,
        args: serializedArgs,
        slots: serializedSlots
      });

      return setRenderedHtml(html);
    } catch {
      // Fall back to direct Container rendering below
    }
  }

  const resolvedComponent = await resolveAstroComponent(component, resolveFrom);
  const container = await getAstroContainer();

  if (!container) {
    throw new Error('Failed to initialize Astro container for rendering');
  }

  // The direct fallback has no handler, so reconstruct nested components here:
  // load each marker's real server module by id and render slot markers to HTML.
  const loadComponent = async (id: string) => {
    const viteServer = await getAstroSsrViteServer(resolveFrom);
    const mod = (await ssrLoadModuleWithFsFallback(viteServer, id)) as Record<string, unknown>;

    return patchCreateAstroCompat(mod.default);
  };
  const reconstructedArgs = await reconstructProps(serializedArgs, { loadComponent });
  const reconstructedSlots = await reconstructSlots(serializedSlots, {
    loadComponent,
    renderToHtml: (child) => container.renderToString(child, {})
  });

  const html = await container.renderToString(resolvedComponent, {
    props: reconstructedArgs,
    slots: reconstructedSlots
  });

  return setRenderedHtml(html);
}

async function renderComposedStory(story: ComposedStory) {
  const meta = story.__storybookAstroMeta;
  const storyExport = story.__storybookAstroStoryExport;
  let component = meta?.component ?? story.component;

  if (!isAstroComponentFactory(component)) {
    const maybeRendered = await story();

    if (isAstroComponentFactory(maybeRendered)) {
      component = maybeRendered;
    } else if (
      typeof maybeRendered === 'object' &&
      maybeRendered !== null &&
      'component' in maybeRendered &&
      isAstroComponentFactory((maybeRendered as { component: unknown }).component)
    ) {
      component = (maybeRendered as { component: unknown }).component;
    }
  }

  if (!component) {
    throw new Error('Unable to resolve Astro component from composed story.');
  }

  const args = {
    ...(meta?.args ?? {}),
    ...(storyExport?.args ?? {}),
    ...(story.args ?? {})
  };

  const resolveFrom = await resolveTestingProjectRoot(component);

  return renderAstroComponentToDom(component, args, resolveFrom);
}

export async function renderStory(story: ComposedStory) {
  return renderComposedStory(story);
}

export const renderAstroStory = renderStory;
