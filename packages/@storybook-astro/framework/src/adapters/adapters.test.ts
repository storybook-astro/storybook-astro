/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp", "Request"]}] */
import { mkdtemp, mkdir, readFile, rm, writeFile, cp, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import { adaptServerBuild, vercel, node, type ServerAdapter } from './index.ts';
import { packageServer } from './packageServer.ts';
import { rewriteRequestBasePath } from './request.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.map((dir) => rm(dir, { recursive: true, force: true })));
  directories.length = 0;
});

async function fixture() {
  const projectDir = await mkdtemp(join(tmpdir(), 'storybook-adapter-test-'));

  directories.push(projectDir);
  const staticDir = join(projectDir, 'ui');
  const serverDir = join(projectDir, 'server');

  await mkdir(staticDir);
  await mkdir(serverDir);
  await writeFile(join(staticDir, 'index.html'), '<h1>Storybook</h1>');
  await writeFile(join(serverDir, 'index.js'), 'export default {};');
  await writeFile(
    join(serverDir, 'deployment.json'),
    JSON.stringify({ basePath: '/custom', runtimeDependencies: [] })
  );
  await writeFile(join(projectDir, 'package.json'), '{"type":"module"}');

  return { projectDir, staticDir, serverDir, basePath: '/custom' };
}

test('a custom adapter receives the complete build with custom output directories', async () => {
  const build = await fixture();
  let received;
  const adapter: ServerAdapter = {
    name: 'custom',
    async adapt(input) {
      received = input;
    }
  };

  await adaptServerBuild(adapter, {
    projectDir: build.projectDir,
    staticDir: 'ui',
    serverDir: 'server'
  });
  expect(received).toEqual(build);
});

test('packaging rejects a root API URL that would shadow the static UI', async () => {
  const build = await fixture();

  await writeFile(
    join(build.serverDir, 'deployment.json'),
    JSON.stringify({ basePath: '/', runtimeDependencies: [] })
  );
  await expect(adaptServerBuild(node(), build)).rejects.toThrow('server.serverUrl');
});

test('packaging fails when an explicitly requested runtime dependency is missing', async () => {
  const build = await fixture();

  await writeFile(
    join(build.serverDir, 'deployment.json'),
    JSON.stringify({
      runtimeDependencies: ['@storybook-astro/not-installed']
    })
  );
  await expect(packageServer(build, join(build.projectDir, 'output'), [])).rejects.toThrow(
    'NF3 could not package required dependencies: @storybook-astro/not-installed'
  );
});

test.skipIf(process.platform !== 'linux')(
  'Vercel emits routing and a function without source references or MSW',
  async () => {
    const build = await fixture();

    await writeFile(join(build.staticDir, 'manager.js'), '// written after the preview build');
    await vercel({ maxDuration: 90 }).adapt(build);
    const output = join(build.projectDir, '.vercel/output');
    const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));

    expect(config.version).toBe(3);
    const route = new RegExp(config.routes[0].src);

    expect(route.test('/custom/render')).toBe(true);
    expect(route.test('/custom')).toBe(true);
    expect(route.test('/other/custom/render')).toBe(false);
    expect(route.test('/custom-debug/render')).toBe(false);
    const functionConfig = JSON.parse(
      await readFile(join(output, 'functions/render.func/.vc-config.json'), 'utf8')
    );

    expect(functionConfig.maxDuration).toBe(90);
    expect(functionConfig.filePathMap).toBeUndefined();
    expect(await readFile(join(output, 'static/manager.js'), 'utf8')).toContain(
      'after the preview'
    );
    await expect(
      realpath(join(output, 'functions/render.func/node_modules/msw'))
    ).rejects.toThrow();
  }
);

test('Node emits a portable listener without Vercel configuration', async () => {
  const build = await fixture();

  await node().adapt(build);
  const output = join(build.projectDir, 'storybook-node');

  expect(await readFile(join(output, 'server.mjs'), 'utf8')).toContain('"/custom"');
  expect(await readFile(join(output, 'static/index.html'), 'utf8')).toContain('Storybook');
  await expect(realpath(join(build.projectDir, '.vercel'))).rejects.toThrow();
});

test('mounting the server preserves request body, query and headers without stripping partial prefixes', async () => {
  const request = new Request('https://example.com/custom/render?story=one', {
    method: 'POST',
    body: '{"args":{}}',
    headers: { authorization: 'Bearer test' }
  });
  const rewritten = rewriteRequestBasePath(request, '/custom');

  expect(rewritten.url).toBe('https://example.com/render?story=one');
  expect(rewritten.method).toBe('POST');
  expect(rewritten.headers.get('authorization')).toBe('Bearer test');
  expect(await rewritten.text()).toBe('{"args":{}}');
  expect(rewriteRequestBasePath(new Request('https://example.com/custom'), '/custom').url).toBe(
    'https://example.com/'
  );
  expect(
    rewriteRequestBasePath(new Request('https://example.com/custom-other'), '/custom').url
  ).toBe('https://example.com/custom-other');
});

test('packaging preserves conflicting dependency versions and runtime files after moving away from the source', async () => {
  const build = await fixture();
  const modules = join(build.projectDir, 'node_modules');

  async function pkg(path: string, manifest: object, source: string) {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(path, 'index.js'), source);
  }
  await pkg(
    join(modules, 'one'),
    { name: 'one', dependencies: { shared: '*' } },
    "module.exports = require('shared');"
  );
  await pkg(
    join(modules, 'two'),
    { name: 'two', dependencies: { shared: '*' }, optionalDependencies: { absent: '*' } },
    "module.exports = require('shared');"
  );
  await pkg(
    join(modules, 'shared'),
    { name: 'shared', version: '1.0.0' },
    "module.exports = 'v1';"
  );
  await pkg(
    join(modules, 'two/node_modules/shared'),
    { name: 'shared', version: '2.0.0' },
    "module.exports = 'v2';"
  );
  await writeFile(join(modules, 'one/template.astro'), '<slot />');
  await writeFile(
    join(build.serverDir, 'deployment.json'),
    JSON.stringify({ basePath: '/custom', runtimeDependencies: ['one', 'two'] })
  );
  const output = join(build.projectDir, 'output');

  await mkdir(output);
  await packageServer(build, output, []);
  const relocated = await mkdtemp(join(tmpdir(), 'storybook-relocated-'));

  directories.push(relocated);
  await cp(output, relocated, { recursive: true, verbatimSymlinks: true });
  await rm(build.projectDir, { recursive: true, force: true });
  const require = createRequire(join(relocated, 'test.cjs'));

  expect(require('one')).toBe('v1');
  expect(require('two')).toBe('v2');
  expect(
    await readFile(
      join(await realpath(join(relocated, 'node_modules/one')), 'template.astro'),
      'utf8'
    )
  ).toBe('<slot />');
});

test('NF3 packages an explicitly included workspace and its assets without unused dependencies', async () => {
  const build = await fixture();
  const workspace = join(build.projectDir, 'workspace');
  const modules = join(build.projectDir, 'node_modules');

  await mkdir(workspace);
  await mkdir(join(modules, 'unused'), { recursive: true });
  await writeFile(
    join(workspace, 'package.json'),
    JSON.stringify({ name: 'linked', dependencies: { unused: '*' } })
  );
  await writeFile(
    join(workspace, 'index.js'),
    "module.exports = require('node:fs').readFileSync(require('node:path').join(__dirname, 'message.txt'), 'utf8');"
  );
  await writeFile(join(workspace, 'message.txt'), 'traced asset');
  await writeFile(join(modules, 'unused/package.json'), '{"name":"unused"}');
  await writeFile(join(modules, 'unused/index.js'), "throw new Error('not used');");
  await symlink('../workspace', join(modules, 'linked'), 'dir');
  await writeFile(
    join(build.serverDir, 'index.js'),
    "import message from 'linked'; export default message;"
  );
  // Local source packages are recorded as runtime inputs by the snapshot build.
  await writeFile(
    join(build.serverDir, 'deployment.json'),
    JSON.stringify({
      basePath: '/custom',
      runtimeDependencies: ['linked']
    })
  );
  const output = join(build.projectDir, 'output');

  await mkdir(output);
  await packageServer(build, output, []);
  const relocated = await mkdtemp(join(tmpdir(), 'storybook-nft-relocated-'));

  directories.push(relocated);
  await cp(output, relocated, { recursive: true, verbatimSymlinks: true });
  await rm(build.projectDir, { recursive: true, force: true });
  // Use Node itself: Vitest's module runner handles symlinks differently.
  const result = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import value from './storybook-server/index.js'; console.log(value);"
    ],
    { cwd: relocated }
  );

  expect(result.stdout.trim()).toBe('traced asset');
  const trace = JSON.parse(await readFile(join(relocated, 'nf3.json'), 'utf8'));

  expect(trace.packages).not.toHaveProperty('unused');
});

test('NF3 includes both Node exports and browser exports used by Vite', async () => {
  const build = await fixture();
  const dependency = join(build.projectDir, 'node_modules/conditional');

  await mkdir(dependency, { recursive: true });
  await writeFile(
    join(dependency, 'package.json'),
    JSON.stringify({
      name: 'conditional',
      type: 'module',
      exports: {
        browser: './browser.js',
        development: './development.js',
        production: './production.js',
        default: './node.js'
      }
    })
  );
  await writeFile(join(dependency, 'node.js'), "export default 'server';");
  await writeFile(join(dependency, 'browser.js'), "export default 'browser';");
  await writeFile(join(dependency, 'development.js'), "export default 'development';");
  await writeFile(join(dependency, 'production.js'), "export default 'production';");
  await writeFile(join(build.serverDir, 'index.js'), "export { default } from 'conditional';");
  const output = join(build.projectDir, 'output');

  await mkdir(output);
  await packageServer(build, output, []);
  for (const entry of ['node', 'browser', 'development', 'production']) {
    expect(
      await readFile(join(output, 'node_modules/conditional', `${entry}.js`), 'utf8')
    ).toContain('export default');
  }
});
