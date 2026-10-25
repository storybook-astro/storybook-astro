import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Storybook Astro · Astro 5 Server',
    brandColor: '#06B6D4',
  }),
});
