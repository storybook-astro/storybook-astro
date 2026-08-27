import { expect, test } from 'vitest';
import { isAstroComponentSlot, type AstroComponentFactory } from '@storybook-astro/renderer/types';
import { definePreview } from './index.ts';
import { composeStory } from './testing/story-composition.ts';

function fakeAstroComponent(moduleId: string): AstroComponentFactory {
  const factory = (() => undefined) as unknown as AstroComponentFactory;

  factory.isAstroComponentFactory = true;
  factory.moduleId = moduleId;

  return factory;
}

const Wrapper = fakeAstroComponent('test:Wrapper');
const Widget = fakeAstroComponent('test:Widget');

// CSF4 coverage (docs/specs/decorators.md#global-decorators): `definePreview` in
// index.ts merges `applyDecorators: input.applyDecorators ?? applyDecorators`
// into the project annotations it hands to Storybook's `definePreviewBase`,
// the same way it merges `render` — this proves a preview built that way
// composes a CSF4 story (`preview.meta().story()`) into the same decorated
// `SlotValue` tree that a plain `.storybook/preview.js` `decorators` array
// produces for CSF3 stories (see Decorator.test.ts in packages/components).
//
// Known limitation, confirmed empirically against Storybook 10.5.2 and left
// undocumented in code otherwise (see the Step 6 report for detail): the CSF4
// story must be composed with `composeStory` (singular), passing
// `meta.input` — not `meta` itself — as the component annotations. A real
// `.stories.ts` file's `export default meta` is the `meta` wrapper object, and
// neither Storybook's own `composeStories` nor `composeStory` unwrap it to
// `meta.input` automatically, so passing it directly throws "component
// annotation is missing from the default export". Calling the CSF4 story's
// own `.run()` isn't a Node-testable alternative either — it always renders
// through `definePreview`'s production `render`, which needs a browser
// (`document is not defined` outside one).
test('definePreview composes a CSF4 story through applyDecorators into a decorated tree', async () => {
  const preview = definePreview({
    decorators: [(_Story) => ({ component: Wrapper })]
  });

  const meta = preview.meta({ component: Widget });
  const story = meta.story({});

  // `story` (a CSF4 Story factory object) and `meta.input` (its plain
  // ComponentAnnotations) don't match `composeStory`'s CSF3-shaped types, but
  // are exactly what it expects at runtime — see the limitation note above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const composed = composeStory(story as any, meta.input as any);
  const tree = await (composed as unknown as () => unknown)();

  expect(isAstroComponentSlot(tree)).toBe(true);
  expect((tree as { component: unknown }).component).toBe(Wrapper);
  expect((tree as { slots: { default: unknown } }).slots.default).toBe(Widget);
});
