import { test, expect, vi } from 'vitest';
import { assertValidSlotValue, reconstructProps, reconstructSlots } from './reconstruct-component-args.ts';

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

test('reconstructSlots renders a configured component with its own props and slots', async () => {
  const loaded = factory('/Card.astro');
  const loadComponent = vi.fn().mockResolvedValue(loaded);
  const renderToHtml = vi.fn().mockResolvedValue('<div class="card">inner</div>');

  const result = await reconstructSlots(
    {
      default: {
        component: marker('/Card.astro'),
        props: { title: 'Hello' },
        slots: { default: '<p>inside</p>' }
      }
    },
    { loadComponent, renderToHtml }
  );

  expect(loadComponent).toHaveBeenCalledWith('/Card.astro');
  expect(renderToHtml).toHaveBeenCalledWith(loaded, { title: 'Hello' }, { default: '<p>inside</p>' });
  expect(result.default).toBe('<div class="card">inner</div>');
});

test('reconstructSlots renders a configured component nested in an array beside strings', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<b>child</b>');

  const result = await reconstructSlots(
    {
      default: [
        '<p>before</p>',
        { component: factory('/Box.astro'), slots: { default: '<p>inside</p>' } },
        '<p>after</p>'
      ]
    },
    { loadComponent: vi.fn(), renderToHtml }
  );

  expect(result.default).toBe('<p>before</p><b>child</b><p>after</p>');
});

test('reconstructSlots reconstructs components inside a configured child’s slots', async () => {
  const loadComponent = vi.fn(async (id: string) => factory(id));
  const renderToHtml = vi
    .fn()
    .mockResolvedValueOnce('<span>grandchild</span>') // inner BoxChild rendered first
    .mockResolvedValueOnce('<div>parent[<span>grandchild</span>]</div>');

  const result = await reconstructSlots(
    {
      default: {
        component: marker('/Parent.astro'),
        slots: { default: marker('/Child.astro') }
      }
    },
    { loadComponent, renderToHtml }
  );

  // The child component's own slot is rendered to HTML before the parent renders.
  expect(renderToHtml).toHaveBeenNthCalledWith(1, expect.anything());
  expect(renderToHtml).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    {},
    { default: '<span>grandchild</span>' }
  );
  expect(result.default).toBe('<div>parent[<span>grandchild</span>]</div>');
});

test('reconstructSlots resolves a component reference passed in a configured child’s props', async () => {
  const loadComponent = vi.fn(async (id: string) => factory(id));
  const renderToHtml = vi.fn().mockResolvedValue('<div>ok</div>');

  await reconstructSlots(
    { default: { component: factory('/Card.astro'), props: { Icon: marker('/Icon.astro') } } },
    { loadComponent, renderToHtml }
  );

  const passedProps = renderToHtml.mock.calls[0][1] as { Icon: { moduleId?: string } };

  expect(loadComponent).toHaveBeenCalledWith('/Icon.astro');
  expect(passedProps.Icon.moduleId).toBe('/Icon.astro');
});

test('reconstructSlots wraps a render failure with the slot name', async () => {
  const renderToHtml = vi.fn().mockRejectedValue(new Error('boom'));

  await expect(
    reconstructSlots({ header: factory('/C.astro') }, { loadComponent: vi.fn(), renderToHtml })
  ).rejects.toThrow(/slot "header".*boom/);
});

test('reconstructSlots runs a configured child’s props through processProps when supplied', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<div>ok</div>');
  const processProps = vi.fn().mockResolvedValue({ processed: true });

  await reconstructSlots(
    { default: { component: factory('/Card.astro'), props: { title: 'Hi' } } },
    { loadComponent: vi.fn(), renderToHtml, processProps }
  );

  expect(processProps).toHaveBeenCalledWith({ title: 'Hi' });
  expect(renderToHtml).toHaveBeenCalledWith(expect.anything(), { processed: true }, {});
});

test('reconstructSlots without processProps falls back to bare component-reference resolution', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<div>ok</div>');

  await reconstructSlots(
    { default: { component: factory('/Card.astro'), props: { Icon: marker('/Icon.astro') } } },
    { loadComponent: vi.fn(async (id: string) => factory(id)), renderToHtml }
  );

  const props = renderToHtml.mock.calls[0][1] as { Icon: { moduleId?: string } };

  expect(props.Icon.moduleId).toBe('/Icon.astro');
});

test('reconstructSlots fails loudly instead of silently truncating past the maximum depth', async () => {
  const renderToHtml = vi.fn().mockResolvedValue('<div>ok</div>');

  // 11 levels of component-in-slot nesting, one more than MAX_DEPTH (10).
  let slotValue: unknown = factory('/Leaf.astro');

  for (let level = 0; level < 11; level += 1) {
    slotValue = { component: factory(`/Wrapper${level}.astro`), slots: { default: slotValue } };
  }

  await expect(
    reconstructSlots({ default: slotValue }, { loadComponent: vi.fn(), renderToHtml })
  ).rejects.toThrow(/maximum depth/);
});

test('assertValidSlotValue accepts a string, a marker, a descriptor, and an array of those', () => {
  expect(() => assertValidSlotValue('<p>hi</p>', 'node')).not.toThrow();
  expect(() => assertValidSlotValue(marker('/A.astro'), 'node')).not.toThrow();
  expect(() => assertValidSlotValue(factory('/A.astro'), 'node')).not.toThrow();
  expect(() =>
    assertValidSlotValue(
      { component: marker('/A.astro'), props: { title: 'hi' }, slots: { default: '<p>x</p>' } },
      'node'
    )
  ).not.toThrow();
  expect(() => assertValidSlotValue(['<p>a</p>', marker('/A.astro'), '<p>b</p>'], 'node')).not.toThrow();
});

test('assertValidSlotValue rejects a value that is none of the supported shapes', () => {
  expect(() => assertValidSlotValue(42, 'node')).toThrow(/not a valid decorator node/);
  expect(() => assertValidSlotValue({ label: 'plain object' }, 'node')).toThrow(/not a valid decorator node/);
});

test('assertValidSlotValue rejects a descriptor whose props or slots are not plain objects', () => {
  expect(() => assertValidSlotValue({ component: marker('/A.astro'), props: 'nope' }, 'node')).toThrow(
    /props must be a plain object/
  );
  expect(() => assertValidSlotValue({ component: marker('/A.astro'), slots: 'nope' }, 'node')).toThrow(
    /slots must be a plain object/
  );
});

test('assertValidSlotValue rejects nesting past the maximum depth', () => {
  let node: unknown = marker('/Leaf.astro');

  for (let level = 0; level < 11; level += 1) {
    node = { component: marker(`/Wrapper${level}.astro`), slots: { default: node } };
  }

  expect(() => assertValidSlotValue(node, 'node')).toThrow(/exceeds the maximum node depth/);
});
