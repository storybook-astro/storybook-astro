import { defineConfig } from 'vitest/config';

// Vitest gives modules no `import.meta.hot`, so the dev transport's HMR calls
// would do nothing in tests. Point them at a global that
// renderer-dev.test.ts fills with a stand-in for Vite's HMR client.
const devTransportHmrCall = /import\.meta\.hot\?\.(send|on)\(/g;

export default defineConfig({
  plugins: [
    {
      name: 'stub-dev-transport-hmr',
      transform: (code, id) =>
        id.endsWith('/src/renderer/renderer-dev.ts')
          ? code.replace(devTransportHmrCall, 'globalThis.__storybookAstroTestHot?.$1(')
          : undefined
    }
  ],
  test: {
    name: 'framework',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
