import Logo from './Logo.astro';

export default {
  title: 'Astro/Logo',
  component: Logo,
  parameters: {
    docs: {
      description: {
        component:
          'A component that imports its own image instead of receiving it through args. Static builds copy the image into the output, since only the server-side render ever imports it.'
      }
    }
  }
};

export const Default = {};
