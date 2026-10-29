import SlotList from './SlotList.astro';

export default {
  title: 'Astro/Scoped Styles/Slotted Content',
  component: SlotList,
  parameters: {
    docs: {
      description: {
        component:
          'A component whose styles target a list passed into its slot (issue #189). Storybook renders it the way the installed Astro version does on a real page, so the result differs by version: Astro 7 scopes the nested selectors, so the slotted list gets no borders. Astro 5 and 6 scope only the top-level `.list` selector, so the list gets red and blue borders.',
      },
    },
  },
};

export const ListInSlot = {
  args: {
    slots: { default: '<ul><li>Item 1</li><li>Item 2</li></ul>' },
  },
};
