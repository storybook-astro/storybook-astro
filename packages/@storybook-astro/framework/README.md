# @storybook-astro/framework

The community-supported [Storybook](https://storybook.js.org/) framework for [Astro](https://astro.build/).

> Astro 5, 6 & 7 + Storybook 10

## Install

```bash
npm install -D storybook @storybook/builder-vite @storybook-astro/framework
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

Node.js 20.16+, 22.19+ or 24+; Storybook 10; Astro 5.5.3+, 6 or 7; Vite 6.4.1+, 7 or 8

## Links

- [Getting Started](https://storybook-astro.org/getting-started)
- [Live Demo](https://demo.storybook-astro.org)
- [GitHub](https://github.com/storybook-astro/storybook-astro)

## License

MIT
