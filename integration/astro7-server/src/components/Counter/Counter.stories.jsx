import { userEvent, within, expect } from 'storybook/test';
import Counter from '@storybook-astro/components/Counter/astro/Counter.astro';

export default {
  title: 'Astro/Counter',
  component: Counter,
  parameters: {
    docs: {
      description: {
        component: 'A minimal increment counter using vanilla JavaScript. No props — starts at 1 and increments on click. Uses an inline `<script>` tag for interactivity.',
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};

export const ClickIncrement = {
  parameters: {
    docs: { description: { story: 'Interaction test: click the button and verify the count increments.' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '+1' });

    await userEvent.click(button);
    await expect(canvas.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 2');
  },
};
