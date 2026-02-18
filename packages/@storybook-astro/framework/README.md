# @storybook-astro/framework

The community-supported [Storybook](https://storybook.js.org/) framework for [Astro](https://astro.build/).

> **Beta** · Astro 5 & 6 + Storybook 10

## Install

```bash
npm install --save-dev storybook @storybook/builder-vite @storybook-astro/framework
```

## Setup

```javascript
// .storybook/main.js
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

## Requirements

Node.js 20.16+, Storybook 10, Astro 5.5.3+ or 6.0.0-beta, Vite 6+

## Links

- [Getting Started](https://storybook-astro.org/getting-started)
- [Live Demo](https://demo.storybook-astro.org)
- [GitHub](https://github.com/storybook-astro/storybook-astro)

## License

MIT
