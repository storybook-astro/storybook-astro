---
title: Sanitization
description: Protect your stories from HTML injection attacks with sanitization.
---

Sanitization helps prevent HTML injection attacks (XSS) by filtering dangerous HTML from story args and slots before they're rendered in Astro components.

## Why sanitization matters

When story args contain HTML strings—especially from user input or dynamic sources—malicious scripts can be injected:

```javascript
// ❌ Unsafe: script tags in args
export const Vulnerable = {
  args: {
    content: '<img src=x onerror="alert(\'XSS\')">',
  },
};
```

Sanitization strips dangerous elements while preserving safe HTML:

```javascript
// ✅ Safe: malicious code removed by sanitization
export const Safe = {
  args: {
    // Script is removed, image tag is preserved (without onerror)
    content: '<img src=x />',
  },
};
```

## Default behavior

Sanitization is **enabled by default** with conservative settings:

- **What's sanitized**: All slot strings by default
- **What's preserved**: A safe allowlist of HTML tags and attributes
- **Dangerous content removed**: Scripts, event handlers, dangerous protocols

The default allowlist includes common formatting tags:

- Text formatting: `<b>`, `<strong>`, `<em>`, `<i>`, `<u>`, `<s>`
- Structure: `<p>`, `<div>`, `<span>`, `<br>`, `<hr>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Tables: `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<th>`, `<td>`
- Media: `<img>` (src, alt, title, width, height)
- Links: `<a>` (href, target, rel)
- Code: `<code>`, `<pre>`, `<kbd>`
- And more...

## Configuration

Configure sanitization in `.storybook/main.js`:

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: {
        enabled: true,
        args: [], // Don't sanitize any args by default
        slots: ['**'], // Sanitize all slot strings
      },
    },
  },
};
```

### `enabled`

Enable or disable sanitization entirely:

```javascript
sanitization: {
  enabled: false, // YOLO mode—no sanitization
}
```

**Use with caution**: Only disable if all content is trusted.

### `args`

Specify which args to sanitize using dot-notation patterns:

```javascript
sanitization: {
  args: [
    'content', // Sanitize Astro.props.content
    'description', // Sanitize Astro.props.description
  ],
}
```

Useful when story args contain HTML that should be filtered.

### `slots`

Specify which slots to sanitize:

```javascript
sanitization: {
  slots: [
    'default', // Sanitize slot.default
    'footer', // Sanitize slot.footer
  ],
}
```

Default is `['**']` (all slots).

## Wildcard patterns

Use wildcards to target nested values:

```javascript
sanitization: {
  args: [
    'items.*.html', // Sanitize html in each item
    'meta.**.content', // Sanitize content at any depth
  ],
}
```

- `*` matches one segment: `items.*.name`
- `**` matches any depth: `data.**.html`

## Custom sanitize-html options

Fine-tune the allowlist by passing `sanitize-html` options:

```javascript
sanitization: {
  sanitizeHtml: {
    allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'li'],
    allowedAttributes: {
      a: ['href', 'target'],
    },
    allowedSchemes: ['https', 'mailto'],
  },
}
```

This creates a minimal allowlist (only paragraphs, emphasis, links, and lists).

### Merging with defaults

Custom options are **merged** with defaults, not replacing them. This means:

```javascript
sanitizeHtml: {
  allowedTags: ['custom-tag'], // Added to defaults
}
```

Results in both default tags AND `custom-tag` being allowed.

### Common customizations

**Allow classes and data attributes**:

```javascript
sanitizeHtml: {
  allowedAttributes: {
    '*': ['class', 'data-*'],
    a: ['href', 'target'],
  },
}
```

**Allow inline styles**:

```javascript
sanitizeHtml: {
  allowedStyles: {
    '*': {
      color: [/^#(?:[0-9a-fA-F]{3}){1,2}$/], // Hex colors
      'font-size': [/^\d+px$/], // Pixel sizes
    },
  },
}
```

**See the full `sanitize-html` documentation** for all available options: https://www.npmjs.com/package/sanitize-html

## Disabling sanitization

Explicitly disable for trusted content:

```javascript
sanitization: {
  enabled: false,
}
```

⚠️ **Only disable if all story content comes from trusted sources** (not user input or dynamic APIs).

## Security best practices

1. **Keep sanitization enabled** by default
2. **Be specific with patterns** — don't over-sanitize
3. **Whitelist, don't blacklist** — only allow known-safe tags
4. **Test sanitization** — verify dangerous content is removed
5. **Document exceptions** — note when/why sanitization is disabled
6. **Audit story content** — review what HTML is being passed as args

## Example: Rich text content

A story that accepts rich text HTML:

```typescript
// RichText.astro
interface Props {
  html: string; // User-provided HTML
}

const { html } = Astro.props;
---

<div class="rich-text" set:html={html} />
```

Configuration:

```javascript
// .storybook/main.js
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: {
        args: ['html'], // Sanitize the html arg
        sanitizeHtml: {
          allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'li', 'blockquote'],
          allowedAttributes: {
            a: ['href', 'target', 'rel'],
          },
        },
      },
    },
  },
};
```

Story:

```javascript
// RichText.stories.jsx
import RichText from './RichText.astro';

export default {
  title: 'Components/RichText',
  component: RichText,
};

export const Safe = {
  args: {
    html: '<p>This is <strong>bold</strong> and <em>italic</em> text.</p>',
  },
};

export const WithDangerousCode = {
  args: {
    html: '<p>Click me: <img src=x onerror="alert(\'XSS\')"></p>',
    // After sanitization: <p>Click me: <img src="x" /></p>
  },
};
```

## Troubleshooting

### Content is being removed unexpectedly

Check your patterns match the arg path:

```javascript
// ❌ Wrong: looking for args.content when it's actually args.body.html
args: ['content'],

// ✅ Correct:
args: ['body.html'],
```

### Need to preserve certain HTML elements

Add them to `allowedTags`:

```javascript
sanitizeHtml: {
  allowedTags: ['details', 'summary'], // Custom elements
}
```

### Styles are being stripped

Configure `allowedStyles` instead of relying on style attributes:

```javascript
sanitizeHtml: {
  allowedStyles: {
    '*': {
      color: [/^#/, /^rgb/], // Colors
    },
  },
}
```
