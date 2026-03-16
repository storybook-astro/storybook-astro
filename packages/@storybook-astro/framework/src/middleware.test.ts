import { describe, expect, test } from 'vitest';

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
});
