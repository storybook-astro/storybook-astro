import NpmWeeklyDownloads from './NpmWeeklyDownloads.astro';

export default {
  title: 'Astro/NpmWeeklyDownloads',
  component: NpmWeeklyDownloads,
  args: {
    packageName: '@storybook-astro/framework',
    label: 'npm weekly downloads',
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Fetches last-week download data in Astro and hydrates a Preact SVG chart whose line draws itself on load.',
      },
    },
  },
  argTypes: {
    packageName: {
      description: 'npm package name used in the weekly downloads API request.',
      control: { type: 'text' },
    },
    label: {
      description: 'Small label shown at the top of the chart card.',
      control: { type: 'text' },
    },
  },
};

export const Default = {
  parameters: {
    docs: {
      description: {
        story: 'Uses story rules + MSW with a steady week of mocked downloads.',
      },
    },
  },
};

export const Skyrocketed = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks a dramatic growth week to prove story rules are swapping network responses.',
      },
    },
  },
};

export const ZeroDownloads = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks a full week of 0 downloads to validate the lower-bound chart behavior.',
      },
    },
  },
};

export const ApiUnavailable = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks an npm API outage to show the empty chart state.',
      },
    },
  },
};
