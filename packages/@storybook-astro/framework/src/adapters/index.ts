import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export { node } from './node.ts';
export { vercel } from './vercel.ts';
export { packageServer } from './packageServer.ts';

/** A completed, host-independent Storybook server build. All paths are absolute. */
export type ServerBuild = {
  projectDir: string;
  staticDir: string;
  serverDir: string;
  basePath: string;
};

/** Providers own packaging and HTTP entrypoints; the render runtime owns neither. */
export type ServerAdapter = {
  name: string;
  adapt(build: ServerBuild): Promise<void>;
};

/** Run after `storybook build`, when manager, preview and public assets are complete. */
export async function adaptServerBuild(
  adapter: ServerAdapter,
  options: {
    projectDir?: string;
    staticDir?: string;
    serverDir?: string;
  } = {}
): Promise<void> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const staticDir = resolve(projectDir, options.staticDir ?? 'storybook-static');
  const serverDir = resolve(projectDir, options.serverDir ?? 'storybook-server');

  await Promise.all([
    access(resolve(staticDir, 'index.html')),
    access(resolve(serverDir, 'index.js'))
  ]);
  const manifest = JSON.parse(await readFile(resolve(serverDir, 'deployment.json'), 'utf8'));

  if (!manifest.basePath || manifest.basePath === '/') {
    throw new Error(
      'Set framework.options.server.serverUrl to an API path such as /api/storybook-astro before packaging the UI and server together.'
    );
  }
  await adapter.adapt({ projectDir, staticDir, serverDir, basePath: manifest.basePath });
}
