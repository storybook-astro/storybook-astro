// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { scheduleRenderLoadingIndicator } from './renderLoadingIndicator.ts';

describe('scheduleRenderLoadingIndicator', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('div');
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    canvas.remove();
  });

  test('fast renders never show an indicator', () => {
    const cleanup = scheduleRenderLoadingIndicator(canvas, { replaceContent: true });

    vi.advanceTimersByTime(100);
    cleanup();
    vi.advanceTimersByTime(10_000);

    expect(canvas.querySelector('[role="status"]')).toBeNull();
  });

  test('replaces stale content after the grace period on story switch', () => {
    canvas.innerHTML = '<p>previous story</p>';
    scheduleRenderLoadingIndicator(canvas, { replaceContent: true });

    vi.advanceTimersByTime(250);

    expect(canvas.textContent).not.toContain('previous story');
    expect(canvas.querySelector('[role="status"]')).not.toBeNull();
    expect(canvas.textContent).toContain('Rendering story…');
  });

  test('overlays existing content for same-story re-renders and restores on cleanup', () => {
    canvas.innerHTML = '<p>current story</p>';

    const cleanup = scheduleRenderLoadingIndicator(canvas, { replaceContent: false });

    vi.advanceTimersByTime(250);

    expect(canvas.textContent).toContain('current story');
    expect(canvas.querySelector('[role="status"]')).not.toBeNull();
    expect(canvas.style.position).toBe('relative');

    cleanup();

    expect(canvas.querySelector('[role="status"]')).toBeNull();
    expect(canvas.textContent).toContain('current story');
    expect(canvas.style.position).toBe('');
  });

  test('reveals the slow-server hint after five seconds', () => {
    scheduleRenderLoadingIndicator(canvas, { replaceContent: true });

    vi.advanceTimersByTime(250);

    const hint = Array.from(canvas.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('starting up')
    );

    expect(hint?.hidden).toBe(true);

    vi.advanceTimersByTime(5000);

    expect(hint?.hidden).toBe(false);
  });

  test('cleanup before the slow hint keeps it hidden', () => {
    const cleanup = scheduleRenderLoadingIndicator(canvas, { replaceContent: true });

    vi.advanceTimersByTime(250);
    cleanup();
    vi.advanceTimersByTime(60_000);

    const hint = Array.from(canvas.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('starting up')
    );

    expect(hint?.hidden).toBe(true);
  });
});
