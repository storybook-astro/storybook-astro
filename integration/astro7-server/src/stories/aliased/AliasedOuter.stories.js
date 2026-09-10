import AliasedOuter from './AliasedOuter.astro';

// Regression fixture for issue #136: this story's module graph reaches
// `~/stories/aliased/tokens` both directly and through a relative `.astro`
// child, exactly the shape that used to 500 in server render mode.
export default {
  title: 'Astro/AliasedImports',
  component: AliasedOuter,
  args: {
    label: 'aliased outer'
  }
};

export const Default = {};
