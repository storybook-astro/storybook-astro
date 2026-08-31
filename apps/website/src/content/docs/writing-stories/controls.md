---
title: Controls & ArgTypes
description: How Astro component props reach Storybook's Controls panel and props table.
---

Your component's props table and description are generated from the JSDoc in its
`.astro` frontmatter. Story files don't need to restate any of it.

## Documenting a component

Write a JSDoc block above the `Props` declaration, and one above each prop:

```astro
---
/**
 * A simple content card with optional highlight styling.
 */
interface Props {
  /** Card heading text. */
  title?: string;
  /** Card body text. */
  content?: string;
  /** Applies a highlighted visual style. */
  highlight?: boolean;
}

const { title = 'Default title', content = 'Default content', highlight = false } = Astro.props;
---
```

The story file only names the component:

```jsx
import Card from './Card.astro';

export default {
  title: 'Components/Card',
  component: Card,
};
```

That produces the component description, a row per prop with its description and
type, and the defaults read from the `Astro.props` destructuring.

### What gets extracted

| From the component | Becomes |
|---|---|
| JSDoc above `Props` (or a block at the top of the frontmatter) | The component description |
| JSDoc above a prop | That prop's description |
| The prop's TypeScript type | The **Type** column |
| A default in the `Astro.props` destructuring | The **Default** column |
| A union of string literals | A select control with those options |
| A prop that is neither optional nor defaulted | Marked **Required** |
| `@default` on a prop | The **Default** column, when the destructuring has none |

Types imported from another file work too, including via tsconfig `paths`
aliases — the extractor uses your project's `tsconfig.json`.

### Inherited props

Components that extend Astro's DOM types pick up a lot:

```astro
---
import type { HTMLTag, Polymorphic } from 'astro/types';

interface Props<Tag extends HTMLTag = 'button' | 'a'> extends Polymorphic<{ as: Tag }> {
  /** Disables interaction. */
  disabled?: boolean;
}

const { as: Tag = 'button', href, class: className } = Astro.props as Props;
---
```

`Polymorphic` alone contributes around 200 attributes, so props declared only in
a dependency are filtered out by default. Two things keep the useful ones:

- A prop you **destructure from `Astro.props`** is always kept, wherever its type
  came from. That's what puts `href` and `class` in the table above.
- A prop you **redeclare in your own `Props`** is always kept, even when the same
  name also exists on the DOM type.

To keep more, pass your own filter:

```js
// .storybook/main.js
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      docgen: {
        // Keep everything, including inherited DOM attributes.
        propFilter: () => true,
      },
    },
  },
};
```

## Overriding what's extracted

`argTypes` still works, and wins over anything extracted. Use it to change how a
prop is *presented* rather than to restate it:

```jsx
export default {
  title: 'Components/Card',
  component: Card,
  argTypes: {
    // Force a colour picker for a prop typed as a plain string.
    accent: { control: 'color' },
    // Hide an inherited prop that isn't interesting for this story.
    class: { table: { disable: true } },
  },
};
```

If you find yourself writing `description`, `table.type` or `table.defaultValue`
by hand, that belongs in the component's JSDoc instead — otherwise the two drift
apart and the story file quietly wins.

## Slots

Slots have no TypeScript representation, so they never appear in the props table.
Describe them in the component's JSDoc block, and pass them through `args.slots`:

```jsx
export const WithMain = {
  args: {
    title: 'Hello',
    slots: { main: '<p>Slot content</p>' },
  },
};
```

## Turning extraction off

```js
// .storybook/main.js
options: {
  docgen: false,
}
```

Extraction is also skipped automatically when `@storybook/addon-docs` isn't
installed, and during test builds.

It needs TypeScript 5.0 or newer, which Astro projects already have. Without it,
docgen is skipped with a warning and everything else keeps working.

## Showing component source

Docs pages render a **Show code** block under each story, and stories with
`parameters.docs.codePanel = true` also get a **Code** panel. Both show the Astro
template your story's args describe, generated fresh on every render — so it
follows along as you change Controls:

```astro
---
import Card from './Card.astro';
---
<Card title="Hello" featured>
  <p>Body content</p>
</Card>
```

The snippet describes the component and its args, not the decorators around it,
so it stays the usage you would copy into a page.

### How values are serialized

| Arg value | Emitted as |
| --- | --- |
| `'text'` | `title="text"` — single-quoted if it contains `"`, a template literal if it contains both quote kinds or a newline |
| `true` | `featured` (bare attribute) |
| `false` | `featured={false}` |
| number / bigint | `count={42}` |
| `Date` | `published={new Date("2026-06-11T10:00:00.000Z")}` |
| object / array | `author={author}`, with `const author = …` hoisted into the frontmatter |
| `''`, `null`, `undefined`, functions | omitted |

`args.slots` becomes the component's children — the `default` slot inline, and
named slots wrapped in `<Fragment slot="name">`. A component (rather than a
string) passed as slot content is shown as a placeholder comment, since it has no
literal template form.

The import path is always written as a sibling (`./Card.astro`). It is a usage
sample rather than a copy of your file layout, so adjust it to wherever the
component actually lives.

### Turning the Code panel on everywhere

`docs.codePanel` is an ordinary Storybook parameter, so setting it once in
`.storybook/preview.js` enables the **Code** panel for every story in the
project — no per-story opt-in:

```javascript
// .storybook/preview.js
const preview = {
  parameters: {
    docs: { codePanel: true },
  },
};

export default preview;
```

Individual stories can still opt out with `docs: { codePanel: false }`, and the
same cascade works at the component level via the meta's `parameters`.

The "Show code" block under stories on a docs page needs no parameter at all —
it is always available.

### Overriding the snippet

Set `parameters.docs.source.code` to show something specific instead — a manual
snippet always wins:

```javascript
export const Custom = {
  parameters: {
    docs: { source: { code: '<Card title="Handwritten" />' } },
  },
};
```

Framework component stories (`parameters.renderer` set to `react`, `vue`, and so
on) are left alone: they render through their own framework, so no Astro snippet
is generated for them.

## Static build limitation

In static builds (`storybook build`), Astro components are pre-rendered at build
time with their default args. The Controls panel cannot re-render them with
different values.

The package handles this automatically: in a static build, all control inputs for
Astro component stories are disabled and an **ℹ️ Astro** info row appears in the
Controls table explaining that the component is pre-rendered. The props table
itself still shows everything extracted from the component.

Controls work fully in dev mode (`storybook dev`) and for framework component
stories (React, Vue, etc.) in all modes.

See [Static Builds](/how-it-works/static-builds/) for more details.
