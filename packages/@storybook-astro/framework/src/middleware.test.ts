import { describe, expect, test, vi } from 'vitest';

type ContainerOptions = { resolve: (specifier: string) => Promise<string> };

const createContainer = vi.hoisted(() => vi.fn(async (_options: ContainerOptions) => ({})));

vi.mock('astro/container', () => ({
  // eslint-disable-next-line camelcase -- Astro's export name
  experimental_AstroContainer: { create: createContainer }
}));

vi.mock('virtual:astro-container-renderers', () => ({
  addRenderers: () => {},
  resolveClientModules: () => undefined
}));

const { handlerFactory } = await import('./middleware.ts');

async function resolveIslandUrl(specifier: string) {
  createContainer.mockClear();
  await handlerFactory([]);

  const [options] = createContainer.mock.calls[0];

  return options.resolve(specifier);
}

describe('middleware', () => {
  describe('Windows absolute path normalization', () => {
    /**
     * Regex pattern used in middleware.ts to detect Windows absolute paths.
     * This pattern matches paths starting with a drive letter (e.g., C:) followed by
     * a forward slash or backslash, indicating a Windows absolute path.
     */
    const windowsPathRegex = /^[a-zA-Z]:[/\\]/;

    test('detects Windows absolute paths with forward slashes', () => {
      const pathToTest = 'C:/Users/project/Component.astro';

      expect(windowsPathRegex.test(pathToTest)).toBe(true);
    });

    test('detects Windows absolute paths with backslashes', () => {
      const pathToTest = 'C:\\Users\\project\\Component.astro';

      expect(windowsPathRegex.test(pathToTest)).toBe(true);
    });

    test('ignores Unix absolute paths', () => {
      const unixPath = '/Users/project/Component.astro';

      expect(windowsPathRegex.test(unixPath)).toBe(false);
    });

    test('ignores relative paths', () => {
      const relativePath = './Component.astro';

      expect(windowsPathRegex.test(relativePath)).toBe(false);
    });

    test('ignores module specifiers', () => {
      const specifier = '@storybook-astro/renderer';

      expect(windowsPathRegex.test(specifier)).toBe(false);
    });

    test('ignores file URLs', () => {
      const fileUrl = 'file:///C:/Users/project/Component.astro';

      expect(windowsPathRegex.test(fileUrl)).toBe(false);
    });
  });

  describe('island component-url', () => {
    test('serves a Windows path with forward slashes through /@fs/ so the island hydrates', async () => {
      await expect(resolveIslandUrl('C:/project/src/ContactForm.tsx')).resolves.toBe(
        '/@fs/C:/project/src/ContactForm.tsx'
      );
    });

    test('serves a Windows path with backslashes through /@fs/ with forward slashes', async () => {
      await expect(resolveIslandUrl('C:\\project\\src\\ContactForm.tsx')).resolves.toBe(
        '/@fs/C:/project/src/ContactForm.tsx'
      );
    });

    test('leaves a Unix path as it is', async () => {
      await expect(resolveIslandUrl('/project/src/ContactForm.tsx')).resolves.toBe(
        '/project/src/ContactForm.tsx'
      );
    });
  });
});
