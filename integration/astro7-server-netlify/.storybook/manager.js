import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Storybook Astro · Astro 7 Server · Netlify',
    brandColor: '#32E6E2',
  }),
});
