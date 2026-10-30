# Astro 6 Server Build on Cloudflare Workers

Server mode packaged by `@storybook-astro/adapter-cloudflare`: one Worker serves
the static Storybook and renders the Astro stories at `/api`.

```bash
# From the repository root:
yarn build:packages

# From this app directory:
yarn build
yarn serve        # local Worker on http://127.0.0.1:6021
npx wrangler deploy -c storybook-cloudflare/wrangler.jsonc
```

Run `yarn test:browser` to build, start the Worker locally and run the
Playwright tests against it.

Story rules mock network requests by wrapping `fetch` for one render
(`.storybook/mock-fetch.ts`), because MSW's Node interceptors do not run on
Workers.
