import SassCard from './SassCard.astro';

export default {
  title: 'Astro/Scoped Styles/SCSS',
  component: SassCard,
  parameters: {
    docs: {
      description: {
        component:
          'A `<style lang="scss">` block. Astro compiles it with the project\'s own `sass` package, then scopes it like any other `<style>` block, so the green border and text apply only to this card.',
      },
    },
  },
};

export const ScssStyleBlock = {};
