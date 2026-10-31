import { describe, expect, test } from 'vitest';
import { compiledStylesheetsFor, isAppliedStylesheet, vitePluginCompiledStylesheets } from './compiledStylesheets.ts';

function transformIn(environment: string, code: string, id: string) {
  const plugin = vitePluginCompiledStylesheets();

  (plugin.transform as (this: object, code: string, id: string) => void).call(
    { environment: { name: environment } },
    code,
    id
  );

  return compiledStylesheetsFor({ config: { plugins: [plugin] } } as never);
}

describe('vitePluginCompiledStylesheets', () => {
  test('records the CSS the SSR environment compiled, by module id', () => {
    expect(transformIn('ssr', '.a{}', '/src/card.css')?.get('/src/card.css')).toBe('.a{}');
  });

  test('drops a byte order mark, so the first rule still applies', () => {
    expect(transformIn('ssr', '\uFEFF.a{}', '/src/card.css')?.get('/src/card.css')).toBe('.a{}');
  });

  test('ignores the browser\'s copy', () => {
    expect(transformIn('client', '.a{}', '/src/card.css')?.has('/src/card.css')).toBe(false);
  });
});

describe('isAppliedStylesheet', () => {
  test.each([
    ['/src/card.css', true],
    ['/src/card.module.scss', true],
    ['/src/Card.astro?astro&type=style&index=0&lang.css', true],
    ['/src/Counter.vue?vue&type=style&index=0&lang.css', true],
    ['/src/card.css?raw', false],
    ['/src/card.css?url', false],
    ['/src/card.css?inline', false],
    ['/src/Card.astro?astro&type=style&index=0&inline&lang.css', false],
    ['/src/theme.ts', false]
  ])('%s → %s', (id, applied) => {
    expect(isAppliedStylesheet(id)).toBe(applied);
  });
});
