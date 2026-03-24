# Sandbox — Astro 5 + Storybook 10.3.3

Test project for validating Storybook Astro compatibility with **Storybook 10.3.3**. This sandbox exists to reproduce and investigate the known initialization error seen outside the main Astro 5 sandbox.

## Purpose

This sandbox is intended to confirm and debug the error:

- `TypeError: Cannot read properties of undefined (reading 'name')`
- Triggered from `astro/dist/vite-plugin-astro/index.js`
- Observed when Storybook 10.3.3 initializes the Astro Vite plugin

## Pinned Versions

- **Astro**: 5.17.2
- **Storybook**: 10.3.3
- **Vite**: 6.x

## Scripts

```bash
yarn workspace @storybook-astro/sandbox-astro5-storybook-10.3 storybook
```

## Expected Result

Running the Storybook script should currently reproduce the compatibility issue. For a working baseline, compare against `apps/sandbox-astro5`, which uses Storybook 10.2.7.
