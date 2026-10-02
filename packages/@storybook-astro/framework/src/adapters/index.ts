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
