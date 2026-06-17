import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

// We avoid a hard import of `astro/assets/fonts/types` here because consumers
// using older Astro versions without the new fonts API would fail to install.
// The provider interface we rely on is small and stable enough to type locally.
export interface StorybookFontProvider {
  name: string;
  init?: (context: { storage: FontStorage; root: URL }) => Promise<void> | void;
  resolveFont: (options: {
    familyName: string;
    weights: string[];
    styles: string[];
    subsets: string[];
    formats: string[];
  }) => Promise<{ fonts: FontFaceData[] } | undefined> | { fonts: FontFaceData[] } | undefined;
}

export interface FontFaceData {
  src: Array<{ url?: string; name?: string; format?: string; tech?: string }>;
  weight?: string | number | [number, number];
  style?: string;
  display?: string;
  unicodeRange?: string[];
  featureSettings?: string;
  variationSettings?: string;
}

export interface StorybookFontFamily {
  name: string;
  cssVariable: string;
  provider: StorybookFontProvider;
  weights?: Array<string | number>;
  styles?: string[];
  subsets?: string[];
  formats?: string[];
  fallbacks?: string[];
  display?: string;
}

interface FontStorage {
  getItem: <T = unknown>(key: string, init?: () => Promise<T> | T) => Promise<T | null>;
  setItem: (key: string, value: unknown) => Promise<void> | void;
}

interface ResolvedFontData {
  componentEntries: Array<[string, { css: string; preloads: never[] }]>;
  fontDataByCssVariable: Record<
    string,
    Array<{
      src: Array<{ url: string; format?: string; tech?: string }>;
      weight?: string;
      style?: string;
    }>
  >;
}

const DEFAULTS = {
  weights: ['400'],
  styles: ['normal', 'italic'],
  subsets: ['latin'],
  formats: ['woff2'],
  fallbacks: ['sans-serif']
} as const;

const VIRTUAL_INTERNAL_ID = 'virtual:astro:assets/fonts/internal';
const VIRTUAL_RUNTIME_ID = 'virtual:astro:assets/fonts/runtime';
const VIRTUAL_RUNTIME_RESOLVER_ID = 'virtual:astro:assets/fonts/runtime/font-file-url-resolver';
const PACKAGE_RUNTIME_IDS = ['astro/assets/fonts/runtime', 'astro/assets/fonts/runtime.js'];

const RUNTIME_STUB = `
export const fontData = {};
export function createGetFontData(fontsMod) {
  return fontsMod?.fontDataByCssVariable ?? {};
}
export const experimental_getFontFileURL = () => undefined;
`;

const RESOLVER_STUB = `
export const runtimeFontFileUrlResolver = { resolve: () => undefined };
`;

/**
 * Resolves Astro's font Provider API for Storybook by reading the user's
 * configured font families, calling each provider to produce @font-face data,
 * and emitting CSS through Astro's font virtual modules.
 *
 * Lightweight first cut: generates @font-face declarations and a CSS variable
 * binding to the family name plus fallbacks. Does not handle preload links,
 * Capsize-optimized fallback metrics, or build-time font file emission — those
 * paths fall back to remote URLs returned by the provider directly.
 *
 * If no families are provided, the plugin emits no-op stubs so Astro's
 * font virtual modules still resolve in projects that don't configure fonts.
 */
export function vitePluginAstroFonts(
  options: {
    fonts?: StorybookFontFamily[];
    root?: string;
  } = {}
): Plugin {
  const families = options.fonts ?? [];
  const rootDir = options.root ?? process.cwd();
  const root = pathToFileURL(rootDir.endsWith('/') ? rootDir : rootDir + '/');

  let resolved: ResolvedFontData | null = null;
  let resolvePromise: Promise<ResolvedFontData> | null = null;

  const ensureResolved = async () => {
    if (!resolvePromise) {
      resolvePromise = resolveAllFamilies(families, root);
    }

    resolved = await resolvePromise;

    return resolved;
  };

  return {
    name: 'storybook-astro-fonts',
    enforce: 'pre',

    async buildStart() {
      await ensureResolved();
    },

    resolveId(id) {
      if (id === VIRTUAL_INTERNAL_ID) {
        return '\0' + VIRTUAL_INTERNAL_ID;
      }
      if (id === VIRTUAL_RUNTIME_ID) {
        return '\0' + VIRTUAL_RUNTIME_ID;
      }
      if (id === VIRTUAL_RUNTIME_RESOLVER_ID) {
        return '\0' + VIRTUAL_RUNTIME_RESOLVER_ID;
      }
      if (PACKAGE_RUNTIME_IDS.includes(id)) {
        return '\0storybook:astro-fonts-runtime';
      }

      return undefined;
    },

    async load(id) {
      if (id === '\0' + VIRTUAL_INTERNAL_ID) {
        const data = resolved ?? (await ensureResolved());

        return {
          code:
            `export const componentDataByCssVariable = new Map(${JSON.stringify(data.componentEntries)});\n` +
            `export const fontDataByCssVariable = ${JSON.stringify(data.fontDataByCssVariable)};\n`
        };
      }
      if (id === '\0' + VIRTUAL_RUNTIME_ID || id === '\0storybook:astro-fonts-runtime') {
        return { code: RUNTIME_STUB };
      }
      if (id === '\0' + VIRTUAL_RUNTIME_RESOLVER_ID) {
        return { code: RESOLVER_STUB };
      }

      return undefined;
    }
  };
}

/**
 * Resolves all font families and returns a single CSS string containing
 * all @font-face declarations and :root CSS variable bindings. Used to
 * inject font CSS into the browser via Storybook's render response.
 */
export async function generateFontCss(families: StorybookFontFamily[], rootDir: string): Promise<string> {
  if (families.length === 0) {
    return '';
  }

  const root = pathToFileURL(rootDir.endsWith('/') ? rootDir : rootDir + '/');
  const { componentEntries } = await resolveAllFamilies(families, root);

  return componentEntries.map(([, { css }]) => css).join('\n');
}

async function resolveAllFamilies(
  families: StorybookFontFamily[],
  root: URL
): Promise<ResolvedFontData> {
  const componentEntries: ResolvedFontData['componentEntries'] = [];
  const fontDataByCssVariable: ResolvedFontData['fontDataByCssVariable'] = {};
  const storage = createMemoryStorage();

  for (const family of families) {
    try {
      if (family.provider.init) {
        await family.provider.init({ storage, root });
      }
      const result = await family.provider.resolveFont({
        familyName: family.name,
        weights: (family.weights ?? DEFAULTS.weights).map(String),
        styles: family.styles ?? [...DEFAULTS.styles],
        subsets: family.subsets ?? [...DEFAULTS.subsets],
        formats: family.formats ?? [...DEFAULTS.formats]
      });
      const faces = result?.fonts ?? [];

      if (faces.length === 0) {
        continue;
      }

      componentEntries.push([
        family.cssVariable,
        { css: buildFamilyCss(family, faces), preloads: [] }
      ]);
      fontDataByCssVariable[family.cssVariable] = faces.map(toFontData);
    } catch (err) {
      // Swallow per-family errors so one bad family doesn't break the rest.
      // Errors surface as the family simply not rendering, matching Astro's
      // behavior when a provider can't resolve a font.
      console.warn(
        `[storybook-astro-fonts] Failed to resolve font family "${family.name}":`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { componentEntries, fontDataByCssVariable };
}

export function buildFamilyCss(family: StorybookFontFamily, faces: FontFaceData[]): string {
  const fallbacks = family.fallbacks ?? [...DEFAULTS.fallbacks];
  const familyList = [JSON.stringify(family.name), ...fallbacks].join(', ');
  const faceBlocks = faces.map((face) => buildFontFaceBlock(family, face)).join('\n');
  const rootRule = `:root { ${family.cssVariable}: ${familyList}; }`;

  return `${faceBlocks}\n${rootRule}`;
}

function buildFontFaceBlock(family: StorybookFontFamily, face: FontFaceData): string {
  const src = face.src
    .map((source) => {
      if (source.url) {
        const format = source.format ? ` format(${JSON.stringify(source.format)})` : '';
        const tech = source.tech ? ` tech(${source.tech})` : '';

        return `url(${JSON.stringify(source.url)})${format}${tech}`;
      }
      if (source.name) {
        return `local(${JSON.stringify(source.name)})`;
      }

      return '';
    })
    .filter(Boolean)
    .join(', ');

  const descriptors: string[] = [
    `font-family: ${JSON.stringify(family.name)};`,
    `src: ${src};`,
    `font-display: ${family.display ?? 'swap'};`
  ];

  if (face.weight !== undefined) {
    const weight = Array.isArray(face.weight) ? face.weight.join(' ') : String(face.weight);

    descriptors.push(`font-weight: ${weight};`);
  }
  if (face.style) {
    descriptors.push(`font-style: ${face.style};`);
  }
  if (face.unicodeRange?.length) {
    descriptors.push(`unicode-range: ${face.unicodeRange.join(', ')};`);
  }
  if (face.featureSettings) {
    descriptors.push(`font-feature-settings: ${face.featureSettings};`);
  }
  if (face.variationSettings) {
    descriptors.push(`font-variation-settings: ${face.variationSettings};`);
  }

  return `@font-face { ${descriptors.join(' ')} }`;
}

function toFontData(face: FontFaceData) {
  return {
    src: face.src
      .filter((source) => source.url)
      .map((source) => ({ url: source.url!, format: source.format, tech: source.tech })),
    weight:
      face.weight !== undefined
        ? Array.isArray(face.weight)
          ? face.weight.join(' ')
          : String(face.weight)
        : undefined,
    style: face.style
  };
}

function createMemoryStorage(): FontStorage {
  const store = new Map<string, unknown>();

  return {
    async getItem(key, init) {
      if (store.has(key)) {
        return store.get(key) as never;
      }
      if (init) {
        const value = await init();

        store.set(key, value);

        return value as never;
      }

      return null;
    },
    async setItem(key, value) {
      store.set(key, value);
    }
  };
}
