#!/usr/bin/env node
import { build } from '../dist/build.js';

const [command, ...args] = process.argv.slice(2);

if (command !== 'build') {
  console.error('Usage: storybook-astro build [Storybook build options]');
  process.exitCode = command === '--help' ? 0 : 1;
} else {
  try {
    await build(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
