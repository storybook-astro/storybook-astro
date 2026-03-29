import '@testing-library/jest-dom/vitest';
import { Window, Element } from 'happy-dom';
import { setProjectAnnotations } from '@storybook-astro/framework';
import * as projectAnnotations from './preview.js';

// Manually set up happy-dom globals — vitest's built-in environment modes
// conflict with some Astro internals, so we wire DOM globals directly.
// @ts-ignore
global.window = new Window({ url: 'https://localhost:8080' });
global.document = global.window.document;
// @ts-ignore
global.Element = Element;

setProjectAnnotations([projectAnnotations]);
