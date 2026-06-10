// Ambient type declarations for *.astro file imports.
//
// Without the Astro language server, TypeScript (and ESLint's type-checker)
// cannot resolve `.astro` modules, so `import Foo from './Foo.astro'` is
// treated as an error-typed value and fires
// @typescript-eslint/no-unsafe-assignment on `component: Foo`.
//
// To opt in, add this to your project's src/env.d.ts:
//
//   /// <reference types="@storybook-astro/framework/shim" />

declare module '*.astro' {
  type AstroComponentFactory = {
    (result: unknown, props: unknown, slots: unknown): unknown | Promise<unknown>;
    isAstroComponentFactory?: boolean;
    moduleId?: string | undefined;
  };
  const Component: AstroComponentFactory;

  export default Component;
}
