import sanitizeHtml from 'sanitize-html';
import type { IOptions } from 'sanitize-html';

type SanitizationPayload = {
  args: Record<string, unknown>;
  slots: Record<string, unknown>;
};

export type SanitizationOptions = {
  enabled?: boolean;
  args?: string[];
  slots?: string[];
  sanitizeHtml?: IOptions;
};

export type ResolvedSanitizationOptions = {
  enabled: boolean;
  args: string[];
  slots: string[];
  sanitizeHtml: IOptions;
};

const DEFAULT_SANITIZE_HTML_OPTIONS: IOptions = {
  allowedTags: [
    'a',
    'abbr',
    'b',
    'blockquote',
    'br',
    'caption',
    'cite',
    'code',
    'col',
    'colgroup',
    'dd',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'kbd',
    'li',
    'mark',
    'ol',
    'p',
    'pre',
    'q',
    'rp',
    'rt',
    'ruby',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'u',
    'ul',
    'var',
    'wbr'
  ],
  allowedAttributes: {
    '*': [
      'aria-describedby',
      'aria-hidden',
      'aria-label',
      'aria-labelledby',
      'class',
      'id',
      'lang',
      'role',
      'title'
    ],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    time: ['datetime']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto', 'tel'],
    img: ['http', 'https', 'data']
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'srcset'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
  parseStyleAttributes: false
};

export function resolveSanitizationOptions(options?: SanitizationOptions): ResolvedSanitizationOptions {
  if (!options) {
    return {
      enabled: true,
      args: [],
      slots: ['**'],
      sanitizeHtml: mergeSanitizeHtmlOptions()
    };
  }

  const enabled = options.enabled ?? true;
  const args = normalizePathList(options.args, 'framework.options.sanitization.args');
  const slots =
    options.slots === undefined
      ? ['**']
      : normalizePathList(options.slots, 'framework.options.sanitization.slots');

  return {
    enabled,
    args,
    slots,
    sanitizeHtml: mergeSanitizeHtmlOptions(options.sanitizeHtml)
  };
}

export function sanitizeRenderPayload(
  payload: SanitizationPayload,
  options: ResolvedSanitizationOptions
): SanitizationPayload {
  if (!options.enabled) {
    return payload;
  }

  const sanitizedArgs =
    options.args.length > 0
      ? sanitizeRecord(payload.args, options.args, options.sanitizeHtml)
      : payload.args;

  const sanitizedSlots =
    options.slots.length > 0
      ? sanitizeRecord(payload.slots, options.slots, options.sanitizeHtml)
      : payload.slots;

  return {
    args: sanitizedArgs,
    slots: sanitizedSlots
  };
}

export function serializeSanitizationOptions(options?: SanitizationOptions): string {
  if (!options) {
    return 'undefined';
  }

  assertNoFunctions(options.sanitizeHtml, 'framework.options.sanitization.sanitizeHtml');

  const state = {
    seen: new WeakSet<object>()
  };

  return serializeValue(options, 'framework.options.sanitization', state);
}

function mergeSanitizeHtmlOptions(userOptions?: IOptions): IOptions {
  const merged: IOptions = {
    ...DEFAULT_SANITIZE_HTML_OPTIONS,
    ...userOptions
  };

  if (
    isRecord(DEFAULT_SANITIZE_HTML_OPTIONS.allowedAttributes) &&
    isRecord(userOptions?.allowedAttributes)
  ) {
    merged.allowedAttributes = {
      ...DEFAULT_SANITIZE_HTML_OPTIONS.allowedAttributes,
      ...userOptions.allowedAttributes
    };
  }

  if (isRecord(userOptions?.allowedClasses)) {
    merged.allowedClasses = {
      ...(isRecord(DEFAULT_SANITIZE_HTML_OPTIONS.allowedClasses)
        ? DEFAULT_SANITIZE_HTML_OPTIONS.allowedClasses
        : {}),
      ...userOptions.allowedClasses
    };
  }

  if (isRecord(userOptions?.allowedStyles)) {
    merged.allowedStyles = {
      ...(isRecord(DEFAULT_SANITIZE_HTML_OPTIONS.allowedStyles)
        ? DEFAULT_SANITIZE_HTML_OPTIONS.allowedStyles
        : {}),
      ...userOptions.allowedStyles
    };
  }

  return merged;
}

function normalizePathList(value: unknown, path: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of dot-path patterns.`);
  }

  const unique = new Set<string>();

  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${path}[${index}] must be a string.`);
    }

    const normalized = entry.trim();

    if (!normalized) {
      throw new Error(`${path}[${index}] cannot be an empty string.`);
    }

    unique.add(normalized);
  });

  return Array.from(unique);
}

function sanitizeRecord(
  record: Record<string, unknown>,
  patterns: string[],
  options: IOptions
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  Object.entries(record).forEach(([key, value]) => {
    sanitized[key] = sanitizeValue(value, key, patterns, options);
  });

  return sanitized;
}

function sanitizeValue(
  value: unknown,
  currentPath: string,
  patterns: string[],
  options: IOptions
): unknown {
  if (typeof value === 'string') {
    if (shouldSanitizePath(currentPath, patterns)) {
      return sanitizeHtml(value, options);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const nextPath = `${currentPath}.${index}`;

      return sanitizeValue(item, nextPath, patterns, options);
    });
  }

  if (isRecord(value)) {
    const sanitized: Record<string, unknown> = {};

    Object.entries(value).forEach(([key, nestedValue]) => {
      const nextPath = `${currentPath}.${key}`;

      sanitized[key] = sanitizeValue(nestedValue, nextPath, patterns, options);
    });

    return sanitized;
  }

  return value;
}

function shouldSanitizePath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPathPattern(path, pattern));
}

function matchesPathPattern(path: string, pattern: string): boolean {
  const pathSegments = path.split('.');
  const patternSegments = pattern.split('.');

  return matchSegments(pathSegments, patternSegments);
}

function serializeValue(value: unknown, path: string, state: { seen: WeakSet<object> }): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const serializedItems = value.map((item, index) =>
      serializeValue(item, `${path}[${index}]`, state)
    );

    return `[${serializedItems.join(', ')}]`;
  }

  if (isRecord(value)) {
    if (state.seen.has(value)) {
      throw new Error(`${path} contains a circular reference.`);
    }

    state.seen.add(value);

    const serializedEntries = Object.entries(value)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .map(([key, nestedValue]) => {
        const serializedNestedValue = serializeValue(nestedValue, `${path}.${key}`, state);

        return `${JSON.stringify(key)}: ${serializedNestedValue}`;
      });

    return `{ ${serializedEntries.join(', ')} }`;
  }

  throw new Error(
    `${path} contains an unsupported value of type ${typeof value}. ` +
      'Only plain objects, arrays, primitives, and regular expressions are supported.'
  );
}

function assertNoFunctions(value: unknown, path: string): void {
  const state = {
    seen: new WeakSet<object>()
  };

  assertNoFunctionsRecursive(value, path, state);
}

function assertNoFunctionsRecursive(
  value: unknown,
  path: string,
  state: { seen: WeakSet<object> }
): void {
  if (typeof value === 'function') {
    throw new Error(
      `${path} cannot contain functions. ` +
        'Function-valued sanitization hooks are not supported in framework options.'
    );
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoFunctionsRecursive(item, `${path}[${index}]`, state);
    });

    return;
  }

  if (isRecord(value)) {
    if (state.seen.has(value)) {
      return;
    }

    state.seen.add(value);

    Object.entries(value).forEach(([key, nestedValue]) => {
      assertNoFunctionsRecursive(nestedValue, `${path}.${key}`, state);
    });
  }
}

function matchSegments(pathSegments: string[], patternSegments: string[]): boolean {
  if (patternSegments.length === 0) {
    return pathSegments.length === 0;
  }

  const [patternHead, ...patternTail] = patternSegments;

  if (patternHead === '**') {
    if (patternTail.length === 0) {
      return true;
    }

    for (let index = 0; index <= pathSegments.length; index += 1) {
      const remainingPath = pathSegments.slice(index);

      if (matchSegments(remainingPath, patternTail)) {
        return true;
      }
    }

    return false;
  }

  if (pathSegments.length === 0) {
    return false;
  }

  const [pathHead, ...pathTail] = pathSegments;

  if (patternHead === '*' || patternHead === pathHead) {
    return matchSegments(pathTail, patternTail);
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (Array.isArray(value) || value instanceof RegExp) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
