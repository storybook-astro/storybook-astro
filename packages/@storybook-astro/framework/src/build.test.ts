import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadMainConfig } from 'storybook/internal/common';
import { afterEach, expect, test, vi } from 'vitest';
import { build } from './build.ts';
import { buildServerApp } from './serverApp/build.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('storybook/internal/common', () => ({ loadMainConfig: vi.fn() }));
vi.mock('./serverApp/build.ts', () => ({ buildServerApp: vi.fn() }));

const serverOptions = { renderMode: 'server', server: { adapter: { name: 'node' } } };

afterEach(() => vi.resetAllMocks());

test('builds the render app from the complete Storybook output', async () => {
  const child = new EventEmitter();

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  vi.mocked(loadMainConfig).mockResolvedValue({
    framework: { options: serverOptions }
  } as unknown as Awaited<ReturnType<typeof loadMainConfig>>);

  const pending = build(['--config-dir', 'config', '--output-dir', 'output/ui', '--test']);

  expect(buildServerApp).not.toHaveBeenCalled();
  expect(loadMainConfig).not.toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    expect.arrayContaining([
      'build',
      '--config-dir',
      'config',
      '--output-dir',
      'output/ui',
      '--test'
    ]),
    { stdio: 'inherit' }
  );
  child.emit('exit', 0);
  await pending;

  expect(loadMainConfig).toHaveBeenCalledWith({ configDir: resolve('config') });
  expect(buildServerApp).toHaveBeenCalledWith({
    projectDir: process.cwd(),
    configDir: resolve('config'),
    staticDir: resolve('output/ui'),
    frameworkOptions: serverOptions
  });
});

test('a failed Storybook build never builds the render app from stale output', async () => {
  const child = new EventEmitter();

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  const pending = build([]);

  child.emit('exit', 1);
  await expect(pending).rejects.toThrow('Storybook build failed (1)');
  expect(loadMainConfig).not.toHaveBeenCalled();
});

test('render app build errors fail the build', async () => {
  const child = new EventEmitter();

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  vi.mocked(loadMainConfig).mockResolvedValue({
    framework: { options: serverOptions }
  } as unknown as Awaited<ReturnType<typeof loadMainConfig>>);
  vi.mocked(buildServerApp).mockRejectedValue(new Error('@astrojs/node is not installed'));
  const pending = build([]);

  child.emit('exit', 0);
  await expect(pending).rejects.toThrow('@astrojs/node is not installed');
});
