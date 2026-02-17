import Accordion from './Accordion.tsx';
import { h } from 'preact';

// Wrapper to clone frozen args from Storybook
function AccordionWrapper(props) {
  const clonedProps = {
    ...props,
    items: props.items ? props.items.map(item => ({ ...item })) : []
  };

  return h(Accordion, clonedProps);
}

export default {
  parameters: {
    renderer: 'preact'
  },
  title: 'Preact/Accordion',
  component: AccordionWrapper,
};

export const Default = {
  args: {
    items: [
      { title: 'Section 1', content: 'Content for section 1' },
      { title: 'Section 2', content: 'Content for section 2' },
      { title: 'Section 3', content: 'Content for section 3' },
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
