/// <reference path="../virtual.d.ts" />

import type { APIContext } from 'astro';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HandlerProps } from '../astroRenderHandler.ts';
import { assertValidSlotValue } from '../lib/reconstruct-component-args.ts';
import { runWithStoryRules } from '../storyRulesRuntime.ts';
import { applyModuleMockSwitches } from './moduleMockSwitches.ts';
import storyRulesConfigModule, {
  storybookAstroStoryRulesConfigFilePath
} from 'virtual:storybook-astro/story-rules';
import {
  storybookAstroServerAuthHeader,
  storybookAstroServerAuthToken
} from 'virtual:storybook-astro/server-auth';

/** Which generated render page renders a story, by story id and by component. */
export type RenderPages = {
  stories: Record<string, string>;
  components: Record<string, string>;
};

/**
 * The `/api` routes of the generated render app. A render runs in this
 * process: the story's render page is rendered through `context.rewrite`, so
 * Astro builds the HTML, styles and island scripts like for any page.
 *
 * This handler is the one place that changes once `@astrojs/runtime` ships a
 * `renderToResponse(Component, { props, slots })`: the rewrite becomes that call.
 */
export function createRenderApi(renderPages: RenderPages) {
  const app = new Hono<{ Bindings: APIContext }>().basePath('/api');
  // Story rules swap module exports for the length of one render, so renders
  // in one process run one at a time.
  let renderQueue = Promise.resolve();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type', storybookAstroServerAuthHeader]
    })
  );

  app.get('/', (context) => context.text('OK'));

  // The preview warms the server up with a GET while the Storybook UI loads.
  app.get('/render', (context) => context.body(null, 204));

  app.post('/render', async (context) => {
    if (!isRequestAuthorized(context.req.header(storybookAstroServerAuthHeader))) {
      return context.text('Unauthorized', 401);
    }

    const input = (await context.req.json()) as HandlerProps;

    if (input.node !== undefined) {
      try {
        assertValidSlotValue(input.node, 'node');
      } catch (error) {
        return context.text(error instanceof Error ? error.message : String(error), 400);
      }
    }

    const page = renderPages.stories[input.story?.id ?? ''] ?? renderPages.components[input.component];

    if (!page) {
      return context.text(`No server render page for ${input.story?.id ?? input.component}`, 404);
    }

    const renderStory = () =>
      runWithStoryRules(
        {
          story: input.story,
          rulesConfigFilePath: storybookAstroStoryRulesConfigFilePath,
          resolveRulesConfigModule: () => storyRulesConfigModule,
          applyModuleMocks: applyModuleMockSwitches
        },
        async () => {
          const response = await context.env.rewrite(
            new Request(new URL(page, context.req.url), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input)
            })
          );

          return { status: response.status, html: await response.text() };
        }
      );
    const result = renderQueue.then(renderStory, renderStory);

    renderQueue = result.then(
      () => undefined,
      () => undefined
    );

    const { status, html } = await result;

    // Astro starts every page with a doctype; the preview injects a fragment.
    return context.html(html.replace(/^<!DOCTYPE html>/i, ''), status as 200);
  });

  return app;
}

/** Checks the incoming auth header against the configured render-server token. */
function isRequestAuthorized(headerValue: string | undefined) {
  if (!storybookAstroServerAuthToken) {
    return true;
  }

  let token = headerValue?.trim();

  if (storybookAstroServerAuthHeader === 'authorization' && token?.startsWith('Bearer ')) {
    token = token.slice('Bearer '.length).trim();
  }

  return Boolean(token) && isSecureEqual(token!, storybookAstroServerAuthToken);
}

/** Compares tokens in constant time, without `node:crypto` so it runs on any host. */
function isSecureEqual(actual: string, expected: string) {
  if (actual.length !== expected.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < actual.length; index++) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}
