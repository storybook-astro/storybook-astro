import '@testing-library/jest-dom/vitest';
// import { Window, Element } from 'happy-dom';

/**
 * FIXME: Vitest native jsdom & happy-dom environment breaks with various frameworks.
 * This is somewhat the easiest way I've found to workaround this problem. It's far
 * from ideal, but gives us way to use testing-library methods natively.
 */
// @ts-expect-error Improve typing
// global.window = new Window({ url: 'https://localhost:8080' });
// global.document = global.window.document;
// // @ts-expect-error Improve typing
// global.Element = Element;
