import Accordion from './Accordion.svelte';

export default {
  parameters: {
    renderer: 'svelte'
  },
  title: 'Svelte/Accordion',
  component: Accordion,
};

export const Default = {
  render: (args) => ({
    Component: Accordion,
    props: args,
  }),
  args: {
    items: [
      { title: 'Section 1', content: 'Content for section 1' },
      { title: 'Section 2', content: 'Content for section 2' },
      { title: 'Section 3', content: 'Content for section 3' },
    ],
  },
};

export const AllowMultiple = {
  render: (args) => ({
    Component: Accordion,
    props: args,
  }),
  args: {
    allowMultiple: true,
    items: [
      { title: 'First Item', content: 'You can open multiple items at once!' },
      { title: 'Second Item', content: 'Try clicking on multiple headers.' },
      { title: 'Third Item', content: 'All can be open simultaneously.' },
    ],
  },
};
