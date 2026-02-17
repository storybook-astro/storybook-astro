import Accordion from './Accordion.tsx';

export default {
  parameters: {
    renderer: 'solid'
  },
  title: 'Solid/Accordion',
  component: Accordion,
};

export const Default = {
  args: {
    items: [
      { title: 'Section 1', content: 'Content for section 1' },
      { title: 'Section 2', content: 'Content for section 2' },
      { title: 'Section 3', content: 'Content for section 2' },
    ],
  },
};

export const AllowMultiple = {
  args: {
    allowMultiple: true,
    items: [
      { title: 'First Item', content: 'You can open multiple items at once!' },
      { title: 'Second Item', content: 'Try clicking on multiple headers.' },
      { title: 'Third Item', content: 'All can be open simultaneously.' },
    ],
  },
};
