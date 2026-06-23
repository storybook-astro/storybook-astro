---
title: Requirements
description: Version requirements for using Storybook Astro.
---

Before installing, ensure your project meets these requirements:

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+ (required for Storybook 10's ESM-only support)
- **Storybook**: 10.0.0+
- **Astro**: 5.5.3+, 6.x, or 7.x
- **Vite**: 6.4.1+ (required by Astro 5), 7.x, or 8.x (Astro 7 uses Vite 8)

You can check your Node.js version with:

```bash
node --version
```

:::note
`npm create storybook@latest` does not yet recognize Astro as a framework. Use the manual setup described in the [Installation](/getting-started/installation/) guide instead.
:::

See the [Version Compatibility](/how-it-works/version-compatibility/) page for the full support matrix and details on how Storybook Astro stays compatible across Astro 5, 6, and 7.
