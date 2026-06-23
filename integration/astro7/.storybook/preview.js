import './preview.css';

/** @type { import('@storybook-astro/framework').Preview } */
const preview = {
  tags: ['autodocs'],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Overview',
          'Astro', ['About', '*'],
          'Alpine', ['About', '*'],
          'React', ['About', '*'],
          'Vue', ['About', '*'],
          'Svelte', ['About', '*'],
          'Preact', ['About', '*'],
          'Solid', ['About', '*'],
        ],
      },
    },
  },
};

export default preview;
