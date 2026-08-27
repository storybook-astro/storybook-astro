import GithubStars from './GithubStars.astro';

export default {
  title: 'Astro/GitHubStars',
  component: GithubStars,
  args: {
    repository: 'storybook-astro/storybook-astro',
    label: 'GitHub stars',
  },
  parameters: {
    layout: 'centered',
  },
};

export const Default = {
  parameters: {
    docs: {
      description: {
        story: 'Uses story rules + module mocks to swap the GitHub SDK client with a deterministic fixture.',
      },
    },
  },
};

export const OneK = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks exactly 1,000 stars to validate small milestone formatting and animation.',
      },
    },
  },
};

export const HundredK = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks 100,000 stars to verify large-number rendering and count-up behavior.',
      },
    },
  },
};

export const AlmostTenMillion = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks 9,999,999 stars to stress-test formatting with very large values.',
      },
    },
  },
};

export const RateLimited = {
  parameters: {
    docs: {
      description: {
        story: 'Mocks a GitHub API rate-limit response so fallback behavior is visible.',
      },
    },
  },
};
