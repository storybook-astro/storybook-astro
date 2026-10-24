import { userEvent, within, expect } from 'storybook/test';
import Accordion from '@storybook-astro/components/Accordion/astro/Accordion.astro';

export default {
  title: 'Astro/Accordion',
  component: Accordion,
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

export const ToggleOpen = {
  parameters: {
    docs: {
      description: {
        story: 'Interaction test: click a header and verify that section expands while the others stay closed.',
      },
    },
  },
  args: {
    items: Default.args.items,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole('button', { name: /Section 1/ });

    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(header);
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Content for section 1')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Section 2/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('button', { name: /Section 3/ })).toHaveAttribute('aria-expanded', 'false');
  },
};

export const ToggleMultiple = {
  parameters: {
    docs: {
      description: {
        story: 'Interaction test: open two sections and verify both stay open while the third stays closed.',
      },
    },
  },
  args: {
    allowMultiple: true,
    items: AllowMultiple.args.items,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole('button', { name: /First Item/ });
    const second = canvas.getByRole('button', { name: /Second Item/ });

    await userEvent.click(first);
    await userEvent.click(second);
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('button', { name: /Third Item/ })).toHaveAttribute('aria-expanded', 'false');
  },
};
