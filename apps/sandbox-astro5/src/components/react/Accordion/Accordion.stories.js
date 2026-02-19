import Accordion from './Accordion.tsx';

export default {
  parameters: {
    renderer: 'react',
    docs: {
      description: {
        component: 'A collapsible section list using React state management (`useState`).',
      },
    },
  },
  title: 'React/Accordion',
  component: Accordion,
  argTypes: {
    items: {
      description: 'Sections to render. Each item has a `title` and `content`.',
      control: 'object',
      table: {
        type: { summary: '{ title: string, content: string }[]' },
        defaultValue: { summary: '[]' },
      },
    },
    allowMultiple: {
      description: 'When true, multiple sections can be open simultaneously.',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Three sections in single-open mode.' } },
  },
  args: {
    items: [
      { title: 'Section 1', content: 'Content for section 1' },
      { title: 'Section 2', content: 'Content for section 2' },
      { title: 'Section 3', content: 'Content for section 3' },
    ],
  },
};

export const AllowMultiple = {
  parameters: {
    docs: { description: { story: 'Multiple sections can be open simultaneously.' } },
  },
  args: {
    allowMultiple: true,
    items: [
      { title: 'First Item', content: 'You can open multiple items at once!' },
      { title: 'Second Item', content: 'Try clicking on multiple headers.' },
      { title: 'Third Item', content: 'All can be open simultaneously.' },
    ],
  },
};
