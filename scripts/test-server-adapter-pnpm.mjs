/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp"]}] */
// Install a real isolated pnpm tree, then run the packaged server after deleting
// that tree. All fixture dependencies are local; the test needs no npm packages.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { packageServer } from '../packages/@storybook-astro/framework/dist/adapters/index.js';

const run = promisify(execFile);
const fixture = await mkdtemp(join(tmpdir(), 'storybook-pnpm-source-'));
const relocated = await mkdtemp(join(tmpdir(), 'storybook-pnpm-output-'));
const app = join(fixture, 'app');

try {
  async function writePackage(directory, manifest, source) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(directory, 'index.cjs'), source);
  }
  for (const [name, version] of [
    ['first', '1'],
    ['second', '2']
  ]) {
    const shared = join(fixture, `shared-${version}`);

    await writePackage(
      shared,
      { name: 'shared', version: `${version}.0.0`, main: 'index.cjs' },
      "module.exports = require('node:fs').readFileSync(require('node:path').join(__dirname, 'value.txt'), 'utf8');"
    );
    await writeFile(join(shared, 'value.txt'), version);
    await writePackage(
      join(fixture, name),
      {
        name,
        version: '1.0.0',
        main: 'index.cjs',
        dependencies: { shared: `file:${shared}` }
      },
      "module.exports = require('shared');"
    );
  }
  await mkdir(app);
  await writeFile(
    join(app, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.21.0',
      dependencies: { first: 'file:../first', second: 'file:../second' }
    })
  );
  await writeFile(join(app, '.npmrc'), 'node-linker=isolated\n');
  await run(
    'corepack',
    [
      'pnpm',
      'install',
      '--offline',
      '--ignore-scripts',
      '--lockfile=false',
      `--store-dir=${join(fixture, 'store')}`
    ],
    { cwd: app }
  );
  assert.ok(
    (await realpath(join(app, 'node_modules/first'))).includes('/.pnpm/'),
    'Fixture did not use the isolated pnpm layout'
  );

  const serverDir = join(app, 'storybook-server');

  await mkdir(serverDir);
  await writeFile(
    join(serverDir, 'index.js'),
    "import first from 'first'; import second from 'second'; import { getRequestListener } from '@hono/node-server'; export default [first, second, typeof getRequestListener];"
  );
  await writeFile(
    join(serverDir, 'deployment.json'),
    JSON.stringify({ runtimeDependencies: [], externalDependencies: ['@hono/node-server'] })
  );
  const output = join(app, 'output');

  await mkdir(output);
  await packageServer(
    {
      projectDir: app,
      serverDir,
      staticDir: join(app, 'storybook-static'),
      basePath: '/api'
    },
    output,
    []
  );
  await cp(output, relocated, { recursive: true, verbatimSymlinks: true });
  await rm(fixture, { recursive: true, force: true });
  await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict'; import result from './storybook-server/index.js'; assert.deepEqual(result, ['1', '2', 'function']);"
    ],
    {
      cwd: relocated,
      env: { ...process.env, NODE_PATH: '' }
    }
  );
  console.warn(
    'NF3 pnpm relocation passed: isolated store, two dependency versions and filesystem assets.'
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
  await rm(relocated, { recursive: true, force: true });
}
