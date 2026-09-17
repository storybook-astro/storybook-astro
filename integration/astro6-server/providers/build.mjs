import process from 'node:process';
import { adaptServerBuild, node, vercel } from '@storybook-astro/framework/adapters';

const target = process.argv[2] ?? 'vercel';

if (!['node', 'vercel'].includes(target)) {
  throw new Error(`Unknown server adapter: ${target}`);
}
await adaptServerBuild(target === 'node' ? node() : vercel());
