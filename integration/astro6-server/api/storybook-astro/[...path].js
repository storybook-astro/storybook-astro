/* global Request, URL */

import app from '../../storybook-server/index.js';
import { handle } from 'hono/vercel';

const renderServer = handle(app);

export default function handler(request) {
  const url = new URL(request.url);

  url.pathname = url.pathname.replace(/^\/api\/storybook-astro/, '') || '/';

  return renderServer(new Request(url, request));
}
