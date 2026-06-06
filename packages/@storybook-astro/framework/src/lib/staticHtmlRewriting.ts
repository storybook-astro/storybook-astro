/**
 * Shared helpers used by both the static prerender build and the standalone
 * render server to turn dev-server rendered Astro HTML into production output.
 *
 * Both pipelines render Astro stories through a Vite SSR runtime, which leaves
 * source-tree module paths (e.g. `/abs/path/Component.jsx`) inside emitted
 * markup such as `<astro-island component-url="...">`. The browser receives
 * built chunks at hashed `/_astro/*` URLs, so the source paths must be
 * rewritten before the HTML is served. Hydrated framework component chunks
 * also have their CSS extracted at build time — without an explicit `<link>`
 * tag, those styles never reach the page.
 */

export type StaticModuleMap = Record<string, string>;
export type StaticCssMap = Record<string, string[]>;

/** Rewrites every reference to a source module path in the rendered HTML to its built-asset URL. */
export function rewriteBuiltModulePaths(html: string, staticModuleMap: StaticModuleMap): string {
  let output = html;
  const entries = Object.entries(staticModuleMap).sort(
    ([left], [right]) => right.length - left.length
  );

  for (const [sourcePath, builtPath] of entries) {
    // Replace the /@fs/-prefixed form first so the bare-path replace below
    // can't truncate it and leave a stray "/@fs" stub in the output.
    output = output.split(toFsPath(sourcePath)).join(builtPath);
    output = output.split(sourcePath).join(builtPath);
  }

  return output;
}

/** Prepends stylesheet links for any built framework chunks referenced by the rendered HTML. */
export function addStaticStylesheets(
  html: string,
  options: { staticModuleMap: StaticModuleMap; staticCssMap: StaticCssMap }
): string {
  const stylesheets = new Set<string>();

  for (const [sourcePath, cssPaths] of Object.entries(options.staticCssMap)) {
    const builtModulePath = options.staticModuleMap[sourcePath];

    // Match either the original source path or the rewritten built module URL.
    if (!html.includes(sourcePath) && (!builtModulePath || !html.includes(builtModulePath))) {
      continue;
    }

    cssPaths.forEach((cssPath) => stylesheets.add(cssPath));
  }

  if (stylesheets.size === 0) {
    return html;
  }

  const stylesheetTags = Array.from(stylesheets)
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join('');

  return `${stylesheetTags}${html}`;
}

/** Converts one source file path into the Vite /@fs/ URL form used during SSR. */
function toFsPath(sourcePath: string) {
  const normalizedPath = sourcePath.replace(/\\/g, '/');

  return normalizedPath.startsWith('/') ? `/@fs${normalizedPath}` : `/@fs/${normalizedPath}`;
}
