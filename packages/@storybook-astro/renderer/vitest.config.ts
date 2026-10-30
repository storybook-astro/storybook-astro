import { defineConfig } from 'vitest/config';

// render.tsx imports modules that only Storybook's Vite build provides. Tests
// resolve them to empty modules and replace them with vi.mock.
const buildOnlyModules = [
  'astro:scripts/page.js',
  'virtual:storybook-astro-renderer',
  'virtual:storybook-renderer-fallback'
];

export default defineConfig({
  plugins: [
    {
      name: 'stub-build-only-modules',
      resolveId: (id) => (buildOnlyModules.includes(id) ? `\0${id}` : undefined),
      load: (id) => (buildOnlyModules.includes(id.slice(1)) ? 'export {};' : undefined)
    }
  ],
  test: {
    name: 'renderer',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
