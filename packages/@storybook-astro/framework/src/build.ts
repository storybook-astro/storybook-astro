import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { loadMainConfig } from 'storybook/internal/common';
import type { StorybookConfig } from './types.ts';

/** Package only after Storybook has finished writing manager, preview and public files. */
export async function build(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    options: {
      'config-dir': { type: 'string', short: 'c' },
      'output-dir': { type: 'string', short: 'o' }
    }
  });
  const projectDir = process.cwd();
  const require = createRequire(resolvePath(projectDir, 'package.json'));
  const storybookDir = dirname(require.resolve('storybook/package.json'));
  const { bin } = require('storybook/package.json');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [resolvePath(storybookDir, typeof bin === 'string' ? bin : bin.storybook), 'build', ...args],
      {
        stdio: 'inherit'
      }
    );

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Storybook build failed (${signal ?? code}).`));
      }
    });
  });

  if (args.includes('--help') || args.includes('-h')) {
    return;
  }

  // Match the environment in which Storybook evaluates main.ts during a build.
  process.env.NODE_ENV ??= 'production';
  const configDir = resolvePath(projectDir, String(values['config-dir'] ?? '.storybook'));
  const config = (await loadMainConfig({ configDir })) as StorybookConfig;
  const options = config.framework.options;

  if (options?.renderMode !== 'server') {
    return;
  }

  if (typeof options.server?.adapter?.adapt !== 'function') {
    throw new Error('Server mode requires server.adapter: vercel() (or node()).');
  }

  const staticDir = resolvePath(projectDir, String(values['output-dir'] ?? 'storybook-static'));

  await options.server.adapter.adapt({
    projectDir,
    staticDir,
    serverDir: resolvePath(dirname(staticDir), 'storybook-server')
  });
}
