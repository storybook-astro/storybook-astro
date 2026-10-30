/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fetch", "Request", "Response"]}] -- runs on Workers */
/**
 * Answers matching `fetch` requests for one render and returns the cleanup that
 * restores the real `fetch`. Renders run one at a time, so a story's mock never
 * leaks into another story.
 */
export function mockFetch(respond: (request: Request) => Response | undefined) {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);

    return respond(request) ?? realFetch(request);
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}
