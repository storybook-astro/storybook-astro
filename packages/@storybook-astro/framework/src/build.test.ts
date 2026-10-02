import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadMainConfig } from 'storybook/internal/common';
import { afterEach, expect, test, vi } from 'vitest';
import { build } from './build.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('storybook/internal/common', () => ({ loadMainConfig: vi.fn() }));

afterEach(() => vi.resetAllMocks());

test('waits for the complete Storybook build before packaging its output', async () => {
  const child = new EventEmitter();
  const adapt = vi.fn();

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  vi.mocked(loadMainConfig).mockResolvedValue({
    framework: { options: { renderMode: 'server', server: { adapter: { adapt } } } }
  } as unknown as Awaited<ReturnType<typeof loadMainConfig>>);

  const pending = build(['--config-dir', 'config', '--output-dir', 'output/ui', '--test']);

  expect(adapt).not.toHaveBeenCalled();
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
  expect(adapt).toHaveBeenCalledWith({
    projectDir: process.cwd(),
    staticDir: resolve('output/ui'),
    serverDir: resolve('output/storybook-server'),
    basePath: '/api'
  });
});

test('a failed Storybook build never packages stale output', async () => {
  const child = new EventEmitter();

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  const pending = build([]);

  child.emit('exit', 1);
  await expect(pending).rejects.toThrow('Storybook build failed (1)');
  expect(loadMainConfig).not.toHaveBeenCalled();
});

test('adapter errors fail the build', async () => {
  const child = new EventEmitter();
  const adapt = vi.fn().mockRejectedValue(new Error('Missing runtime package'));

  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  vi.mocked(loadMainConfig).mockResolvedValue({
    framework: { options: { renderMode: 'server', server: { adapter: { adapt } } } }
  } as unknown as Awaited<ReturnType<typeof loadMainConfig>>);
  const pending = build([]);

  child.emit('exit', 0);
  await expect(pending).rejects.toThrow('Missing runtime package');
});
