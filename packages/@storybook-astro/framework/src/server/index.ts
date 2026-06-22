/// <reference path="../virtual.d.ts" />

import { timingSafeEqual } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HandlerProps } from '../astroRenderHandler.ts';
import { createProductionRenderRuntime } from '../productionRenderRuntime.ts';
import {
  addStaticStylesheets,
  rewriteBuiltModulePaths
} from '../lib/staticHtmlRewriting.ts';
import sanitization from 'virtual:storybook-astro/sanitize-config';
import {
  storybookAstroServerAuthHeader,
  storybookAstroServerAuthToken
} from 'virtual:storybook-astro/server-auth';
import {
  integrations,
  runtimeConfig
} from 'virtual:storybook-astro/server-runtime';

const app = new Hono();
const renderAstroStoryPromise = createAstroStoryRenderer();

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
  const renderAstroStory = await renderAstroStoryPromise;
  const html = await renderAstroStory({
    component: input.component ?? '',
    args: input.args ?? {},
    slots: input.slots ?? {},
    story: input.story
  });

  // The server runtime renders against source modules, then rewrites the HTML
  // so the browser only sees built asset URLs and matching stylesheets.
  return context.text(
    addStaticStylesheets(rewriteBuiltModulePaths(html, runtimeConfig.staticModuleMap), {
      staticModuleMap: runtimeConfig.staticModuleMap,
      staticCssMap: runtimeConfig.staticCssMap
    })
  );
});

export default app;

/** Creates the server-mode Astro story renderer from the shared production runtime. */
async function createAstroStoryRenderer() {
  const snapshotRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    runtimeConfig.snapshotDirName
  );
  const storyRulesConfigFilePath = runtimeConfig.storyRulesConfigRelativePath
    ? resolve(snapshotRoot, runtimeConfig.storyRulesConfigRelativePath)
    : undefined;
  const runtime = await createProductionRenderRuntime({
    integrations,
    sanitization: sanitization ?? undefined,
    storyRulesConfigFilePath,
    staticModuleMap: runtimeConfig.staticModuleMap,
    trackedSpecifiers: new Set(runtimeConfig.trackedSpecifiers),
    resolveFrom: snapshotRoot,
    resolveComponentId: (componentId: string) =>
      resolveSnapshotComponentPath(snapshotRoot, componentId)
  });

  return runtime.renderAstroStory;
}

/** Resolves one original component id to the copied file inside the runtime snapshot. */
function resolveSnapshotComponentPath(snapshotRoot: string, componentId: string) {
  const snapshotComponentPath = runtimeConfig.componentPathMap[componentId];

  if (snapshotComponentPath) {
    return resolve(snapshotRoot, snapshotComponentPath);
  }

  return componentId;
}

/** Checks the incoming auth header against the configured render-server token. */
function isRequestAuthorized(headerValue: string | undefined) {
  if (!storybookAstroServerAuthToken) {
    return true;
  }

  const normalizedHeaderValue = normalizeAuthHeaderValue(headerValue);

  if (!normalizedHeaderValue) {
    return false;
  }

  return isSecureEqual(normalizedHeaderValue, storybookAstroServerAuthToken);
}

/** Normalizes auth header values so bearer and raw token formats compare the same way. */
function normalizeAuthHeaderValue(value: string | undefined) {
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

/** Compares auth tokens without leaking length-matched timing differences. */
function isSecureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

