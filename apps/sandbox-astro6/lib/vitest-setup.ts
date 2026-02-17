import '@testing-library/jest-dom/vitest';
import { Window, Element } from 'happy-dom';

/**
 * Workaround: Vitest's native jsdom & happy-dom environment breaks with various
 * framework integrations. Manually creating a happy-dom Window and assigning its
 * globals is the most reliable way to enable testing-library methods natively.
 */
// @ts-expect-error Improve typing
global.window = new Window({ url: 'https://localhost:8080' });
global.document = global.window.document;
// @ts-expect-error Improve typing
global.Element = Element;
