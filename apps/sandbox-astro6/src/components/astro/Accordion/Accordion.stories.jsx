import Accordion from './Accordion.astro';

export default {
  title: 'Astro/Accordion',
  component: Accordion,
  parameters: {
    docs: {
      description: {
        component: 'A collapsible section list with vanilla JS toggle behavior. Renders server-side with no framework runtime — interactivity uses an inline `<script>` tag.',
      },
    },
  },
  argTypes: {
    items: {
      description: 'Sections to render. Each item has a `title` (header text) and `content` (body text).',
      control: 'object',
      table: {
        type: { summary: '{ title: string, content: string }[]' },
        defaultValue: { summary: '[]' },
      },
    },
    allowMultiple: {
      description: 'When true, multiple sections can be open at the same time. When false, opening one section closes the others.',
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
    docs: { description: { story: 'Three sections in single-open mode. Click a header to expand it.' } },
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
