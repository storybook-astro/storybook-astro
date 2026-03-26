import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HandlerProps } from '../middleware.ts';
import { handlerFactory } from '../middleware.ts';
import astroFiles from 'virtual:astro-files';
import sanitization from 'virtual:storybook-astro-sanitization-config';
import storyRulesConfigModule, {
  storybookAstroStoryRulesConfigFilePath
} from 'virtual:storybook-astro-story-rules-config';
import {
  storybookAstroServerAuthHeader,
  storybookAstroServerAuthToken
} from 'virtual:storybook-astro-server-auth-config';

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
  return handlerFactory([], {
    mode: 'production',
    sanitization: sanitization ?? undefined,
    rulesConfigFilePath: storybookAstroStoryRulesConfigFilePath,
    resolveRulesConfigModule: () => storyRulesConfigModule,
    loadModule: async (componentId) => {
      const component = astroFiles[componentId as keyof typeof astroFiles];

      if (!component) {
        throw new Error(
          `Unable to resolve Astro component "${componentId}" in the server build output.`
        );
      }

      return {
        default: component
      };
    }
  });
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
