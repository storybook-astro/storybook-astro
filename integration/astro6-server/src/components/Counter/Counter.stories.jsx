import { userEvent, within, expect } from 'storybook/test';
import Counter from '@storybook-astro/components/Counter/astro/Counter.astro';

export default {
  title: 'Astro/Counter',
  component: Counter,
};

export const Default = {};

export const ClickIncrement = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '+1' });

    await userEvent.click(button);
    await expect(canvas.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 2');
  },
};
