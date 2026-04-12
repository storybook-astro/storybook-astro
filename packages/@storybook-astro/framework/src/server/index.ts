/// <reference path="../virtual.d.ts" />

import { timingSafeEqual } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAstroRenderHandler, type HandlerProps } from '../astroRenderHandler.ts';
import sanitization from 'virtual:storybook-astro-sanitization-config';
import {
  storybookAstroServerAuthHeader,
  storybookAstroServerAuthToken
} from 'virtual:storybook-astro-server-auth-config';
import {
  storybookAstroServerRuntimeComponentPathMap,
  storybookAstroServerRuntimeIntegrations,
  storybookAstroServerRuntimeSnapshotDirName,
  storybookAstroServerRuntimeStaticModuleMap,
  storybookAstroServerRuntimeStoryRulesConfigRelativePath,
  storybookAstroServerRuntimeTrackedSpecifiers
} from 'virtual:storybook-astro-server-runtime-config';
import {
  createClientModuleResolver,
  createProductionAstroContainer,
  createStorySsrViteServer,
  loadRulesConfigModule
} from '../storySsrVite.ts';

const app = new Hono();
const renderHandlerPromise = createRenderHandler();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type', storybookAstroServerAuthHeader]
  })
);

app.get('/', async (context) => context.text('OK'));

app.post('/render', async (context) => {
  if (!isRequestAuthorized(context.req.header(storybookAstroServerAuthHeader))) {
    return context.text('Unauthorized', 401);
  }

  const input = (await context.req.json()) as Partial<HandlerProps>;
  const renderHandler = await renderHandlerPromise;
  const html = await renderHandler({
    component: input.component ?? '',
    args: input.args ?? {},
    slots: input.slots ?? {},
    story: input.story
  });

  return context.text(html);
});

export default app;

async function createRenderHandler() {
  const snapshotRoot = resolve(dirname(fileURLToPath(import.meta.url)), storybookAstroServerRuntimeSnapshotDirName);
  const storyRulesConfigFilePath = storybookAstroServerRuntimeStoryRulesConfigRelativePath
    ? resolve(snapshotRoot, storybookAstroServerRuntimeStoryRulesConfigRelativePath)
    : undefined;
  const viteServer = await createStorySsrViteServer({
    integrations: storybookAstroServerRuntimeIntegrations,
    trackedSpecifiers: new Set(storybookAstroServerRuntimeTrackedSpecifiers),
    resolveFrom: snapshotRoot
  });
  const resolveClientModule = createClientModuleResolver(
    storybookAstroServerRuntimeIntegrations,
    storybookAstroServerRuntimeStaticModuleMap
  );
  const container = await createProductionAstroContainer({
    integrations: storybookAstroServerRuntimeIntegrations,
    resolveClientModule,
    viteServer
  });

  return createAstroRenderHandler({
    container,
    sanitization: sanitization ?? undefined,
    rulesConfigFilePath: storyRulesConfigFilePath,
    resolveRulesConfigModule: () => loadRulesConfigModule(viteServer, storyRulesConfigFilePath),
    loadModule: async (componentId) => {
      const resolvedComponentId = resolveServerComponentPath(snapshotRoot, componentId);
      const loadedModule = await viteServer.ssrLoadModule(resolvedComponentId);

      return {
        default: loadedModule.default
      };
    },
    invalidateModuleGraph: () => {
      viteServer.moduleGraph.invalidateAll();
    }
  });
}

function resolveServerComponentPath(snapshotRoot: string, componentId: string) {
  const mappedPath = storybookAstroServerRuntimeComponentPathMap[componentId];

  if (mappedPath) {
    return resolve(snapshotRoot, mappedPath);
  }

  return componentId;
}

function isRequestAuthorized(headerValue: string | undefined) {
  if (!storybookAstroServerAuthToken) {
    return true;
  }

  const normalizedHeaderValue = normalizeHeaderValue(headerValue);

  if (!normalizedHeaderValue) {
    return false;
  }

  return isSecureEqual(normalizedHeaderValue, storybookAstroServerAuthToken);
}

function normalizeHeaderValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (storybookAstroServerAuthHeader === 'authorization' && trimmedValue.startsWith('Bearer ')) {
    return trimmedValue.slice('Bearer '.length).trim();
  }

  return trimmedValue;
}

function isSecureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
