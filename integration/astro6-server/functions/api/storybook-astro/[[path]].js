/* global Request, URL */

import app from '../../../storybook-server/index.js';

/**
 * Cloudflare Pages Function handler
 * Routes /api/storybook-astro/* requests to the Hono render server
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Remove the /api/storybook-astro prefix to match Hono app routes
  url.pathname = url.pathname.replace(/^\/api\/storybook-astro/, '') || '/';

  // Pass the request to the Hono app
  // Hono expects: fetch(request, env, context)
  return app.fetch(new Request(url, request), context.env, context);
}
