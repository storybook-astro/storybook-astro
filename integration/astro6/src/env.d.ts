/// <reference types="astro/client" />

declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
  const component: AstroComponentFactory;

  export default component;
}

// Provided by the project-level Vite plugin in astro.config.mjs
// (see ../vite-plugin-project-banner.mjs).
declare module 'virtual:project-banner' {
  const banner: string;

  export default banner;
}
