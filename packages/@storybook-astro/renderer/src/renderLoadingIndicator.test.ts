// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  hideRenderLoadingIndicator,
  holdCanvasHeight,
  releaseCanvasHeight,
  showRenderLoadingIndicator
} from './renderLoadingIndicator.ts';

let canvas: HTMLElement;

const indicator = () => canvas.querySelector<HTMLElement>('[data-storybook-astro-loading]');

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="storybook-root"></div>';
  canvas = document.getElementById('storybook-root')!;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showRenderLoadingIndicator', () => {
  test('shows nothing for a render that settles within 200 ms', () => {
    const hide = showRenderLoadingIndicator(canvas);

    vi.advanceTimersByTime(150);
    hide();
    vi.advanceTimersByTime(1000);

    expect(canvas.innerHTML).toBe('');
  });

  test('fills an empty canvas, as after a story switch, and adds a hint after 2.5 s', () => {
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    expect(indicator()?.getAttribute('role')).toBe('status');
    expect(indicator()?.textContent).toContain('Rendering story…');
    expect(indicator()?.style.position).toBe('');
    expect(indicator()?.querySelector('[hidden]')).not.toBeNull();

    vi.advanceTimersByTime(2200);

    expect(indicator()?.querySelector('[hidden]')).not.toBeNull();

    vi.advanceTimersByTime(100);

    expect(indicator()?.querySelector('[hidden]')).toBeNull();
    expect(indicator()?.textContent).toContain('Still working');
  });

  test('overlays a story still on the canvas, as on a Controls change, and puts the canvas back after', () => {
    canvas.innerHTML = '<div>story</div>';
    const hide = showRenderLoadingIndicator(canvas);

    vi.advanceTimersByTime(200);

    expect(canvas.firstElementChild?.textContent).toBe('story');
    expect(indicator()?.style.position).toBe('absolute');
    expect(canvas.style.position).toBe('relative');
    // Above positioned story elements, such as a sticky header with z-index: 1
    expect(indicator()?.style.zIndex).toBe('2147483647');

    hide();

    expect(canvas.innerHTML).toBe('<div>story</div>');
    expect(canvas.style.position).toBe('');
  });

  test('fits the overlay to a story shorter than the standalone indicator', () => {
    canvas.innerHTML = '<button>story</button>';
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    expect(indicator()?.style.minHeight).toBe('');
    expect(indicator()?.style.overflow).toBe('hidden');
  });

  test('lays the overlay out in one row with a small spinner, so it fits a button-height canvas', () => {
    canvas.innerHTML = '<button>story</button>';
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    const spinner = indicator()?.firstElementChild as HTMLElement;

    expect(indicator()?.style.flexDirection).toBe('row');
    expect(indicator()?.style.gap).toBe('8px');
    expect(spinner.style.width).toBe('16px');
    expect(spinner.style.height).toBe('16px');
  });

  test('keeps the column layout for an empty canvas', () => {
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    expect(indicator()?.style.flexDirection).toBe('column');
    expect((indicator()?.firstElementChild as HTMLElement).style.width).toBe('28px');
  });

  test('spins with an infinite CSS animation, which Storybook does not wait on before reporting a story rendered', () => {
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    const spinner = indicator()?.firstElementChild as HTMLElement;

    expect(spinner.style.animation).toContain('sb-rotate360');
    expect(spinner.style.animation).toContain('infinite');
  });

  test('keeps the spinner still for readers who prefer reduced motion', () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query) => ({ matches: query.includes('reduce') }) as MediaQueryList);

    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    const spinner = indicator()?.firstElementChild as HTMLElement;

    expect(spinner.style.animation).toBe('');
    matchMedia.mockRestore();
  });

  test('puts no <style> in the canvas', () => {
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(200);

    expect(canvas.querySelector('style')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
  });

  test('shows one indicator when a newer render starts before the older one settles', () => {
    const hideOlder = showRenderLoadingIndicator(canvas);

    vi.advanceTimersByTime(300);
    showRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(300);
    hideOlder();

    expect(canvas.querySelectorAll('[data-storybook-astro-loading]')).toHaveLength(1);
  });

  test('hideRenderLoadingIndicator removes the indicator for a render that isn\'t an Astro one', () => {
    showRenderLoadingIndicator(canvas);
    hideRenderLoadingIndicator(canvas);
    vi.advanceTimersByTime(1000);

    expect(indicator()).toBeNull();
  });
});

describe('holdCanvasHeight', () => {
  test('keeps an emptied canvas at its height until the next render settles', () => {
    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });

    holdCanvasHeight(canvas);
    canvas.innerHTML = '';

    expect(canvas.style.minHeight).toBe('900px');

    releaseCanvasHeight(canvas);

    expect(canvas.style.minHeight).toBe('');
  });

  test('restores a min-height the canvas had of its own', () => {
    canvas.style.minHeight = '50px';
    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });

    holdCanvasHeight(canvas);
    releaseCanvasHeight(canvas);

    expect(canvas.style.minHeight).toBe('50px');
  });
});
