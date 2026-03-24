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

  test('merges sanitize-html classes and styles options', () => {
    const options = resolveSanitizationOptions({
      sanitizeHtml: {
        allowedClasses: {
          p: ['prose']
        },
        allowedStyles: {
          '*': {
            color: [/^#(?:[0-9a-fA-F]{3}){1,2}$/]
          }
        }
      }
    });

    expect(options.sanitizeHtml.allowedClasses).toMatchObject({
      p: ['prose']
    });

    expect(options.sanitizeHtml.allowedStyles).toMatchObject({
      '*': {
        color: [expect.any(RegExp)]
      }
    });
  });

  test('rejects invalid path lists', () => {
    expect(() =>
      resolveSanitizationOptions({
        args: ['ok', '  ']
      })
    ).toThrow('framework.options.sanitization.args[1] cannot be an empty string.');
  });

  test('rejects non-array path list values', () => {
    expect(() =>
      resolveSanitizationOptions({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: 'content' as any
      })
    ).toThrow('framework.options.sanitization.args must be an array of dot-path patterns.');
  });

  test('rejects non-string entries in path lists', () => {
    expect(() =>
      resolveSanitizationOptions({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: ['ok', 1 as any]
      })
    ).toThrow('framework.options.sanitization.args[1] must be a string.');
  });

  test('supports ** suffix matching and leaves non-matching paths untouched', () => {
    const options = resolveSanitizationOptions({
      args: ['**.html'],
      slots: []
    });

    const payload = sanitizeRenderPayload(
      {
        args: {
          items: [
            {
              nested: {
                html: '<p>Safe<script>alert(1)</script></p>'
              },
              content: '<p>Leave<script>alert(1)</script></p>'
            }
          ]
        },
        slots: {}
      },
      options
    );

    const items = payload.args.items as Array<{ nested: { html: string }; content: string }>;

    expect(items[0].nested.html).toBe('<p>Safe</p>');
    expect(items[0].content).toBe('<p>Leave<script>alert(1)</script></p>');
  });

  test('does not sanitize when path is shorter than pattern and keeps non-string values', () => {
    const options = resolveSanitizationOptions({
      args: ['title.html'],
      slots: []
    });

    const regexValue = /hello/i;

    const payload = sanitizeRenderPayload(
      {
        args: {
          title: '<p>Keep<script>alert(1)</script></p>',
          count: 1,
          truthy: true,
          pattern: regexValue
        },
        slots: {}
      },
      options
    );

    expect(payload.args.title).toBe('<p>Keep<script>alert(1)</script></p>');
    expect(payload.args.count).toBe(1);
    expect(payload.args.truthy).toBe(true);
    expect(payload.args.pattern).toBe(regexValue);
  });

  test('supports null-prototype records during traversal', () => {
    const options = resolveSanitizationOptions({
      args: ['meta.html'],
      slots: []
    });

    const meta = Object.create(null) as Record<string, unknown>;

    meta.html = '<p>Safe<script>alert(1)</script></p>';

    const payload = sanitizeRenderPayload(
      {
        args: {
          meta
        },
        slots: {}
      },
      options
    );

    expect((payload.args.meta as Record<string, unknown>).html).toBe('<p>Safe</p>');
  });
});
