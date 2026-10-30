/// <reference path="../virtual.d.ts" />

import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HandlerProps } from '../astroRenderHandler.ts';
import { assertValidSlotValue } from '../lib/reconstruct-component-args.ts';
import {
  addStaticStylesheets,
  rewriteBuiltModulePaths,
  type StaticCssMap,
  type StaticModuleMap
} from '../lib/staticHtmlRewriting.ts';
import {
  storybookAstroServerAuthHeader,
  storybookAstroServerAuthToken
} from 'virtual:storybook-astro/server-auth';

/**
 * The render API both server runtimes expose: the Vite runtime (index.ts) and
 * the compiled one (compiled.ts). The preview calls a fixed same-origin `/api`,
 * so every host mounts this app as-is.
 */
export function createRenderServerApp(options: {
  renderAstroStory: Promise<(input: HandlerProps) => Promise<string>>;
  staticModuleMap: StaticModuleMap;
  staticCssMap: StaticCssMap;
}) {
  const app = new Hono().basePath('/api');

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

    // `createAstroRenderHandler` validates `node` too, but that happens inside the
    // render queue — reject a malformed decorator tree here so a bad request gets
    // a plain 400 instead of surfacing as a queued render failure.
    if (input.node !== undefined) {
      try {
        assertValidSlotValue(input.node, 'node');
      } catch (error) {
        return context.text(error instanceof Error ? error.message : String(error), 400);
      }
    }

    const renderAstroStory = await options.renderAstroStory;
    const html = await renderAstroStory({
      component: input.component ?? '',
      args: input.args ?? {},
      slots: input.slots ?? {},
      node: input.node,
      story: input.story
    });

    // The server runtime renders against source modules, then rewrites the HTML
    // so the browser only sees built asset URLs and matching stylesheets.
    return context.text(
      addStaticStylesheets(rewriteBuiltModulePaths(html, options.staticModuleMap), {
        staticModuleMap: options.staticModuleMap,
        staticCssMap: options.staticCssMap
      })
    );
  });

  return app;
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
