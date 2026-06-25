import IconButton from './IconButton.astro';
import Badge from './Badge.astro';

export default {
  title: 'Astro/Nesting/Prop',
  component: IconButton,
  parameters: {
    docs: {
      description: {
        component:
          'Passing an Astro component as a prop. The parent template renders it with `<Icon />`, so the Container resolves the real component factory.',
      },
    },
  },
};

export const ComponentAsProp = {
  args: {
    label: 'Save',
    Icon: Badge,
  },
};
