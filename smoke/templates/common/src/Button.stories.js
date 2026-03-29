import Button from './Button.astro';

export default {
  title: 'Smoke/Button',
  component: Button,
  argTypes: {
    label: { control: 'text' },
    variant: { control: { type: 'select' }, options: ['primary', 'secondary'] },
    disabled: { control: 'boolean' },
  },
};

export const Primary = {
  args: { label: 'Primary button', variant: 'primary' },
};

export const Secondary = {
  args: { label: 'Secondary button', variant: 'secondary' },
};

export const Disabled = {
  args: { label: 'Disabled button', disabled: true },
};
