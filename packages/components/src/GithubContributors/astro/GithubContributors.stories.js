import GithubContributors from './GithubContributors.astro';

export default {
  title: 'Astro/GitHubContributors',
  component: GithubContributors,
  args: {
    repository: 'storybook-astro/storybook-astro',
    label: 'contributors',
    visibleContributors: 4,
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Fetches contributors on the Astro server and renders a compact avatar list with a total count.',
      },
    },
  },
  argTypes: {
    repository: {
      description: 'GitHub repository in `owner/name` format.',
      control: { type: 'text' },
    },
    label: {
      description: 'Small label shown above the count and avatars.',
      control: { type: 'text' },
    },
    visibleContributors: {
      description: 'Maximum number of avatars to render before showing `+X`.',
      control: { type: 'number' },
    },
  },
};

export const Default = {
  parameters: {
    docs: {
      description: {
        story: 'Uses story rules + module mocks to replace the GitHub SDK client with contributor fixtures.',
      },
    },
  },
};

export const SmallTeam = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks a tiny repository where all contributors can fit with no `+X`.',
      },
    },
  },
};

export const HugeCommunity = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks a very large project and confirms only top avatars are rendered while `+X` represents the rest.',
      },
    },
  },
};

export const ApiUnavailable = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks an unavailable GitHub contributors API response.',
      },
    },
  },
};
