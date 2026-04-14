import { userEvent, within, expect } from 'storybook/test';
import Accordion from '@storybook-astro/components/Accordion/astro/Accordion.astro';

export default {
  title: 'Astro/Accordion',
  component: Accordion,
  argTypes: {
    items: { control: 'object' },
    allowMultiple: { control: 'boolean' },
  },
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

export const ToggleOpen = {
  args: {
    items: [{ title: 'Section 1', content: 'Content for section 1' }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole('button', { name: /Section 1/ });

    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(header);
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Content for section 1')).toBeVisible();
  },
};

export const ToggleMultiple = {
  args: {
    allowMultiple: true,
    items: [
      { title: 'First Item', content: 'First content' },
      { title: 'Second Item', content: 'Second content' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole('button', { name: /First Item/ });
    const second = canvas.getByRole('button', { name: /Second Item/ });

    await userEvent.click(first);
    await userEvent.click(second);
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
  },
};
