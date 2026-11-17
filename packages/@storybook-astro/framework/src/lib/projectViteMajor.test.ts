import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { version as bundledViteVersion } from 'vite';
import { resolveProjectViteMajor } from './projectViteMajor.ts';

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'project-vite-major-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function installPackage(packageDir: string, name: string, version: string) {
  const packageJsonPath = join(workspace, packageDir, 'package.json');

  mkdirSync(dirname(packageJsonPath), { recursive: true });
  writeFileSync(packageJsonPath, JSON.stringify({ name, version }));
}

function linkPackage(linkPath: string, targetDir: string) {
  mkdirSync(dirname(join(workspace, linkPath)), { recursive: true });
  symlinkSync(join(workspace, targetDir), join(workspace, linkPath), 'dir');
}

function createApp(appDir: string) {
  mkdirSync(join(workspace, appDir), { recursive: true });

  return join(workspace, appDir);
}

describe('finding the Vite that runs Storybook', () => {
  test('a pnpm app without a direct vite dependency uses the Vite builder-vite runs, not an older hoisted one (#378)', () => {
    const app = createApp('apps/frontend');

    installPackage('node_modules/vite', 'vite', '6.4.5');
    installPackage(
      'node_modules/.pnpm/@storybook+builder-vite@10.6.5/node_modules/@storybook/builder-vite',
      '@storybook/builder-vite',
      '10.6.5'
    );
    installPackage('node_modules/.pnpm/@storybook+builder-vite@10.6.5/node_modules/vite', 'vite', '8.3.5');
    linkPackage(
      'apps/frontend/node_modules/@storybook/builder-vite',
      'node_modules/.pnpm/@storybook+builder-vite@10.6.5/node_modules/@storybook/builder-vite'
    );

    expect(resolveProjectViteMajor(app)).toBe(8);
  });

  test('an app on Vite 7 next to a hoisted Vite 8 stays on Vite 7 (#174)', () => {
    const app = createApp('integration/astro6');

    installPackage('node_modules/vite', 'vite', '8.0.16');
    installPackage('integration/astro6/node_modules/vite', 'vite', '7.3.1');
    installPackage('integration/astro6/node_modules/@storybook/builder-vite', '@storybook/builder-vite', '10.6.5');

    expect(resolveProjectViteMajor(app)).toBe(7);
  });

  test('without builder-vite installed, the project’s own Vite decides', () => {
    const app = createApp('app');

    installPackage('app/node_modules/vite', 'vite', '7.3.1');

    expect(resolveProjectViteMajor(app)).toBe(7);
  });

  test('when the project resolves no Vite at all, the Vite this package imports decides', () => {
    const app = createApp('app');

    expect(resolveProjectViteMajor(app)).toBe(Number.parseInt(bundledViteVersion, 10));
  });
});
