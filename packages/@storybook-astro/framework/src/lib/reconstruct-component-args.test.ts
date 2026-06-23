import { test, expect, vi } from 'vitest';
import { reconstructProps, reconstructSlots } from './reconstruct-component-args.ts';

const marker = (moduleId: string) => ({ __astroComponent: true as const, moduleId });

// A fake Astro factory: a function carrying the detection flag + moduleId.
const factory = (moduleId: string) =>
  Object.assign(() => undefined, { isAstroComponentFactory: true as const, moduleId });

test('reconstructProps resolves a marker to the loaded factory', async () => {
  const loaded = factory('/Icon.astro');
  const loadComponent = vi.fn().mockResolvedValue(loaded);

  const result = await reconstructProps({ Icon: marker('/Icon.astro') }, { loadComponent });

  expect(loadComponent).toHaveBeenCalledWith('/Icon.astro');
  expect(result.Icon).toBe(loaded);
});

test('reconstructProps passes a raw factory through (testing path)', async () => {
  const raw = factory('/Icon.astro');
  const loadComponent = vi.fn();

  const result = await reconstructProps({ Icon: raw }, { loadComponent });

  expect(result.Icon).toBe(raw);
  expect(loadComponent).not.toHaveBeenCalled();
});

test('reconstructProps resolves markers nested in objects and arrays', async () => {
  const loadComponent = vi.fn(async (id: string) => factory(id));

  const result = await reconstructProps(
    { wrap: { Icon: marker('/A.astro') }, list: [marker('/B.astro'), 'x'] },
    { loadComponent }
  );

  const resolvedIcon = (result.wrap as Record<string, unknown>).Icon as { moduleId?: string };
  const resolvedListItem = (result.list as Array<{ moduleId?: string }>)[0];

  expect(resolvedIcon.moduleId).toBe('/A.astro');
  expect(resolvedListItem.moduleId).toBe('/B.astro');
  expect((result.list as unknown[])[1]).toBe('x');
});

test('reconstructProps preserves identity when there are no component references', async () => {
  const args = { title: 'hi', meta: { src: '/img.png', width: 10 } };
  const result = await reconstructProps(args, { loadComponent: vi.fn() });

  expect(result.meta).toBe(args.meta);
});

test('reconstructSlots renders a marker to HTML via the loaded component', async () => {
  const loaded = factory('/Child.astro');
  const loadComponent = vi.fn().mockResolvedValue(loaded);
  const renderToHtml = vi.fn().mockResolvedValue('<span>child</span>');

  const result = await reconstructSlots({ default: marker('/Child.astro') }, {
    loadComponent,
    renderToHtml
  });

  expect(loadComponent).toHaveBeenCalledWith('/Child.astro');
  expect(renderToHtml).toHaveBeenCalledWith(loaded);
  expect(result.default).toBe('<span>child</span>');
});

test('reconstructSlots renders a raw factory slot and passes strings through', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<b>x</b>');

  const result = await reconstructSlots(
    { default: factory('/Child.astro'), footer: '<p>plain</p>' },
    { loadComponent: vi.fn(), renderToHtml }
  );

  expect(result.default).toBe('<b>x</b>');
  expect(result.footer).toBe('<p>plain</p>');
});

test('reconstructSlots concatenates an array slot into one HTML string', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<i>c</i>');

  const result = await reconstructSlots({ default: [marker('/C.astro'), ' and ', '<u>d</u>'] }, {
    loadComponent: vi.fn(async (id: string) => factory(id)),
    renderToHtml
  });

  expect(result.default).toBe('<i>c</i> and <u>d</u>');
});

test('reconstructSlots wraps a render failure with the slot name', async () => {
  const renderToHtml = vi.fn().mockRejectedValue(new Error('boom'));

  await expect(
    reconstructSlots({ header: factory('/C.astro') }, { loadComponent: vi.fn(), renderToHtml })
  ).rejects.toThrow(/slot "header".*boom/);
});
