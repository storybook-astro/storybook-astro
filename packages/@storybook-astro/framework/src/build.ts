import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { loadMainConfig } from 'storybook/internal/common';
import { buildServerApp } from './serverApp/build.ts';
import type { StorybookConfig } from './types.ts';

/**
 * `storybook-astro build`: Storybook's build, then in server mode the render
 * app, which takes the finished Storybook output as its public directory.
 */
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
  const frameworkOptions = config.framework.options;

  if (frameworkOptions?.renderMode !== 'server') {
    return;
  }

  await buildServerApp({
    projectDir,
    configDir,
    staticDir: resolvePath(projectDir, String(values['output-dir'] ?? 'storybook-static')),
    frameworkOptions
  });

  if (frameworkOptions.server.adapter.nextSteps) {
    console.log(`\n[storybook-astro] ${frameworkOptions.server.adapter.nextSteps}\n`);
  }
}
