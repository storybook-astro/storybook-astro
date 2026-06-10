// Ambient type declarations for *.astro file imports.
//
// Without the Astro language server, TypeScript (and ESLint's type-checker)
// cannot resolve `.astro` modules, so `import Foo from './Foo.astro'` is
// treated as an error-typed value and fires
// @typescript-eslint/no-unsafe-assignment on `component: Foo`.
//
// This file is automatically referenced from dist/index.d.ts via a triple-slash
// directive, so any project that imports from @storybook-astro/framework gets
// these declarations without any manual setup.

declare module '*.astro' {
  type AstroComponentFactory = {
    (result: unknown, props: unknown, slots: unknown): unknown | Promise<unknown>;
    isAstroComponentFactory?: boolean;
    moduleId?: string | undefined;
  };
  const Component: AstroComponentFactory;

  export default Component;
}
