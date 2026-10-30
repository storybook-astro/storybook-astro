// `@storybook-astro/framework/server-app`: what the generated render app
// imports at request time. Nothing here may start Vite or read the source tree.
export { createRenderApi, type RenderPages } from './renderApi.ts';
export { resolveStoryTree, type StoryTree } from './storyTree.ts';
// The generated mock switch modules register here, and the render API flips
// them, so both must load this same module.
export { registerModuleMockSwitch } from './moduleMockSwitches.ts';
