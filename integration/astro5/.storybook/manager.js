import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Storybook Astro · Astro 5',
    brandColor: '#FF5D01',
  }),
});
