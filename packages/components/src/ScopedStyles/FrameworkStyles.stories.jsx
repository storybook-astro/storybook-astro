import FrameworkStyles from './FrameworkStyles.astro';

export default {
  title: 'Astro/Scoped Styles/Framework Style Blocks',
  component: FrameworkStyles,
  parameters: {
    docs: {
      description: {
        component:
          'A Vue and a Svelte component rendered on the server, without a `client:*` directive. Their `<style>` blocks ship with the story, as they do on an Astro page: the badge is green and the tag blue.',
      },
    },
  },
};

export const ServerRendered = {};
