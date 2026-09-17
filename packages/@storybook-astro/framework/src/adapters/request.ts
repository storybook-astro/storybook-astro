/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["Request"]}] */
/** Mount a root-based render app without changing the method, body or query string. */
export function rewriteRequestBasePath(request: Request, basePath: string): Request {
  const url = new URL(request.url);

  if (basePath !== '/' && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))) {
    url.pathname = url.pathname.slice(basePath.length) || '/';
  }

  return new Request(url, request);
}
