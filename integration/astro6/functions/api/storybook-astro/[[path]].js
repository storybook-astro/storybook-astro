/* global Request, URL */

import app from '../../../storybook-server/index.js';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Remove the /api/storybook-astro prefix to match the Hono app routes
  url.pathname = url.pathname.replace(/^\/api\/storybook-astro/, '') || '/';

  return app.fetch(new Request(url, request), context.env, context);
}
