import { describe, expect, test } from 'vitest';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './sanitization.ts';

describe('sanitization', () => {
  test('enables sanitization and sanitizes all slots by default', () => {
    const options = resolveSanitizationOptions();

    expect(options.enabled).toBe(true);
    expect(options.args).toEqual([]);
    expect(options.slots).toEqual(['**']);

    const payload = sanitizeRenderPayload(
      {
        args: {
          title: '<b>Leave args as-is</b><script>alert(1)</script>'
        },
        slots: {
          default: '<p>Hello<script>alert(1)</script></p>'
        }
      },
      options
    );

    expect(payload.args.title).toBe('<b>Leave args as-is</b><script>alert(1)</script>');
    expect(payload.slots.default).toBe('<p>Hello</p>');
  });

  test('sanitizes only configured arg paths', () => {
    const options = resolveSanitizationOptions({
      args: ['content'],
      slots: []
    });

    const payload = sanitizeRenderPayload(
      {
        args: {
          content: '<p>Hello</p><script>alert(1)</script>',
          title: '<b>Keep me</b><script>alert(1)</script>'
        },
        slots: {}
      },
      options
    );

    expect(payload.args.content).toBe('<p>Hello</p>');
    expect(payload.args.title).toBe('<b>Keep me</b><script>alert(1)</script>');
  });

  test('supports wildcard patterns for nested values', () => {
    const options = resolveSanitizationOptions({
      args: ['items.*.html'],
      slots: []
    });

    const payload = sanitizeRenderPayload(
      {
        args: {
          items: [{ html: '<img class="hero" src="x" onerror="alert(1)"><p>Safe</p>' }]
        },
        slots: {}
      },
      options
    );

    expect(payload.args.items).toEqual([{ html: '<img class="hero" src="x" /><p>Safe</p>' }]);
  });

  test('returns payload untouched when sanitization is disabled', () => {
    const options = resolveSanitizationOptions({
      enabled: false,
      args: ['content']
    });

    const payload = {
      args: {
        content: '<p>Hello</p><script>alert(1)</script>'
      },
      slots: {
        default: '<p>Body<script>alert(1)</script></p>'
      }
    };

    const sanitizedPayload = sanitizeRenderPayload(payload, options);

    expect(sanitizedPayload).toBe(payload);
  });

  test('merges sanitize-html object options with defaults', () => {
    const options = resolveSanitizationOptions({
      sanitizeHtml: {
        allowedAttributes: {
          section: ['data-foo']
        }
      }
    });

    expect(options.sanitizeHtml.allowedAttributes).toMatchObject({
      a: ['href', 'name', 'target', 'rel'],
      section: ['data-foo']
    });
  });

  test('rejects invalid path lists', () => {
    expect(() =>
      resolveSanitizationOptions({
        args: ['ok', '  ']
      })
    ).toThrow('framework.options.sanitization.args[1] cannot be an empty string.');
  });
});
