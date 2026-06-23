import Panel from './Panel.astro';
import Badge from './Badge.astro';

export default {
  title: 'Astro/Nesting/Slot',
  component: Panel,
  parameters: {
    docs: {
      description: {
        component:
          'Passing an Astro component as slot content (the React `children` pattern). Slot content can be an HTML string or another Astro component — see issue #128.',
      },
    },
  },
};

export const ComponentInSlot = {
  args: {
    title: 'Component slot',
    slots: { default: Badge },
  },
};

export const StringInSlot = {
  args: {
    title: 'String slot',
    slots: { default: '<p data-testid="plain-slot">plain string slot</p>' },
  },
};
