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
| A `<slot>` in the template | A row in the **Slots** section (see [Slots](#slots)) |

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
    // Force a color picker for a prop typed as a plain string.
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

The props table lists the slots a component accepts in a **Slots** section, even
when no story passes content to them. The extractor finds every `<slot>` in the
template, named or default, and the slot names the frontmatter reads with
`Astro.slots.render()` or `Astro.slots.has()`. A slot whose name is an expression
(`<slot name={name} />`) isn't listed, since its name is only known at render time.

To describe a slot, put a comment starting with `@slot` directly before it:

```astro
<article>
  {/* @slot The card body */}
  <slot />
  <footer>
    {/* @slot Buttons shown under the body */}
    <slot name="actions" />
  </footer>
</article>
```

`{/* … */}` comments are removed from the rendered HTML. An HTML comment
(`<!-- @slot … -->`) works too, but Astro keeps it in the page.

Astro slots are always optional, so none are marked **Required**. Pass slot
content through `args.slots`:

```jsx
export const WithMain = {
  args: {
    title: 'Hello',
    slots: { main: '<p>Slot content</p>' },
  },
};
```

Each slot row also has a text control, starting at the story's content for that
slot, so you can edit a slot's HTML in the Controls panel instead of in a JSON
object. Once you edit a slot's control, your edit wins over the same slot in
`args.slots`. Until then `args.slots` decides, so a play function's
`updateArgs({ slots })` still shows. A slot whose story content is a component,
rather than a string, has no control, since it can't be edited as text. When
every slot a story fills has its own text control, the `slots` row has no JSON
editor, since an edit in a slot's control would override it. If any slot lacks
a text control, the JSON editor stays so that slot can still be edited. Slot
HTML goes through the same [sanitization](/guides/sanitization/) as any string
slot content, so attributes outside the allowlist, such as `data-*`, are
removed. With the [Docgen Server](#moving-extraction-off-the-dev-server)
enabled, slots are listed but have no text control yet
([#267](https://github.com/storybook-astro/storybook-astro/issues/267)). Slot
rows come from the same extraction as the props table, so they need TypeScript
installed, and `@storybook/addon-docs` unless the Docgen Server is on (see
[Turning extraction off](#turning-extraction-off)).

Each control is stored in a story arg named `slot-<name>`, for example
`slot-footer`, which the renderer folds back into `args.slots`. You don't need to
write these yourself. A slot edit is saved in the story's URL, so it survives a
reload or a shared link, only when it is plain text (ASCII letters, digits,
spaces, `_` and `-`). Storybook leaves values with HTML, punctuation or any
other character, such as an accented letter (`á`, `ñ`), out of the URL.

## Moving extraction off the dev server

By default extraction runs in the Vite plugin, on the dev server. Storybook 10.6
can instead run it in a long-lived worker thread it owns, which keeps the
TypeScript work off the critical path:

```js
// .storybook/main.js
export default {
  features: {
    experimentalDocgenServer: true, // Storybook 10.6–10.x
    // docgenServer: true,          // Storybook 11 renames the flag
  },
};
```

Use the name your Storybook reads. Storybook 11 renamed the flag to
`docgenServer` and no longer reads the old one (its `docgen-server`
automigration rewrites it for you). If you set the name your version ignores,
extraction stays in the builder and Storybook Astro logs a warning naming the
right flag.

The props table and description are the same either way — it is the same
extractor, just running somewhere else. The one difference is that slot rows
have no text control on this path yet. What you gain is that a large component
library no longer blocks story transforms while its types are checked, and
static builds get per-component JSON snapshots under
`services/core/docgen/` instead of inlining docgen into the preview bundle.

Two caveats:

- The feature is **experimental upstream**, and Storybook notes the payload
  shape may still change. It is off unless you turn it on.
- `docgen.propFilter` is **ignored** here. A filter is a function, and the worker
  receives its configuration as plain data across a thread boundary, so there is
  no way to send one. Leave the feature off if you need a custom filter — you'll
  get a warning if both are set.

On Storybook 10.0–10.5 the flag is accepted but the helpers this builds on don't
exist yet, so extraction stays in the builder and logs a note saying so.

## Components manifest and AI agents

Storybook's components manifest lists your components in a JSON file that tools
can read, with each Astro component's description and a reference to its props.
`@storybook/addon-mcp` reads it so an AI agent can find your components and how
to use them without opening their source.

Astro components reach the manifest through the
[Docgen Server](#moving-extraction-off-the-dev-server), so turn it on together
with `componentsManifest`. This needs Storybook 10.6 or newer:

```js
// .storybook/main.js
export default {
  features: {
    experimentalDocgenServer: true, // Storybook 10.6–10.x
    // docgenServer: true,          // Storybook 11 renames the flag
    componentsManifest: true,
  },
};
```

An AI agent then gets each Astro component's description, props and slots. Its
props come as a Markdown `Props` type, the same shape Storybook gives React
components: each prop with its type, a `?` when it's optional, its default as
the component's `Astro.props` destructuring writes it, and its JSDoc
description. A **Slots** list follows, with each slot's `@slot`
description and a line on how a story fills them. Both come from the rows the
extractor builds for the props table, so a prop it leaves out because it comes
from a dependency (see [Inherited props](#inherited-props)) is left out here
too. Hiding a row with `table: { disable: true }` in a story's
`argTypes` only hides it from the table: the agent still sees the prop. For
example, `docs-show` from `@storybook/addon-mcp` returns this for a button:

````md
## Props

```
export type Props = {
  /**
    Visual treatment.
  */
  variant?: "solid" | "soft" | "outline" = 'solid';
  disabled?: boolean = false;
  href?: string | URL | null;
}
```

## Slots

- `default` (child content)

In a story, pass slot content in `args.slots` (`slots: { default: '…' }`).
````

Each story also gets its description and an Astro snippet, the usage Show code
prints for the story (see [Showing component source](#showing-component-source)),
with the component's import in the frontmatter. The description is the story's
JSDoc comment, or else its `parameters.docs.description.story`. As for React
components, `docs-show` shows a component's first three stories with their
snippets and lists the rest by name, and `docs-show-story` returns one story:

````md
# Button - Outline

Outline variant at large size.

```
---
import Button from './Button.astro';
---
<Button size="lg" variant="outline">
  Read the docs
</Button>
```
````

The snippet is built from the stories file without running it, so it uses the
story's args as written, merged over the meta's. An arg that isn't a literal
value, such as a component in a slot, an imported image or the result of a
function call, can't be read that way. That story gets a warning naming the arg
instead of a snippet, and `docs-show` lists it by name. A function arg is left
out, as Show code leaves it out. A story that sets `parameters.renderer` to a
framework integration has no Astro snippet. `storybook build` writes the story
snippets to `services/core/story-docs/` in the output directory.

In dev, `/manifests/components.html` shows the same Markdown for each Astro
component. A static build (`storybook build`) writes `manifests/components.json`
to the output directory, with an entry for each component (a component is left
out when all of its stories are tagged `!manifest`); an Astro component's entry
holds its description and a reference to its props and that Markdown under
`services/core/docgen/`. Only Astro components get a description and props.
Components from React, Vue, Svelte, Solid and Preact are listed without a
description or props. The JSON file is written by `storybook build`; in dev
with the Docgen Server on, Storybook doesn't serve it.

The manifest comes from the same extraction as the props table, so it needs
TypeScript installed (see [Turning extraction off](#turning-extraction-off)).
With extraction turned off (`docgen: false`) or in a test build
(`storybook build --test`), the build still writes `components.json`, but Astro
components are listed without a description or props. Unlike the props table,
the manifest doesn't need `@storybook/addon-docs`. On Storybook 10.6 and newer,
with the Docgen Server off, the build writes no `components.json`. On Storybook
10.0–10.5, Storybook Astro can't run the Docgen Server, so the manifest has no
description or props for Astro components; on 10.5 with both flags on, the
build also logs a manifest error.

## Turning extraction off

```js
// .storybook/main.js
options: {
  docgen: false,
}
```

Extraction is also skipped automatically during test builds and, unless the
Docgen Server is on, when `@storybook/addon-docs` isn't installed.

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
| object / array | `author={author}`, with `const author = …` hoisted into the frontmatter, or written out in the attribute with `objectProps: 'inline'` (see below) |
| `''`, `null`, `undefined`, functions, Symbols | omitted |

Inside an object or array, a `Date` stays `new Date(...)`, a BigInt keeps its
`n`, and `NaN`, `Infinity` and `undefined` array entries are written as
themselves. Object members that are `undefined`, functions or Symbols are left
out, and a function or Symbol array entry is written as `undefined`, so the
entries after it keep their positions. Other built-ins such as `Map`, `Set` and
`RegExp` still print as `{}`, as JSON prints them, and a value with a `toJSON`
method, such as a `URL`, is shown as what `toJSON` returns. A prop the snippet
can't write as a literal at all, such as a Symbol or an object that refers back
to itself, is left out of the snippet rather than breaking it.

`args.slots` becomes the component's children — the `default` slot inline, and
named slots wrapped in `<Fragment slot="name">`. A component (rather than a
string) passed as slot content is shown as a placeholder comment, since it has no
literal template form.

The import path is always written as a sibling (`./Card.astro`). It is a usage
sample rather than a copy of your file layout, so adjust it to wherever the
component actually lives.

### Writing object props inline

By default an object or array prop goes into the frontmatter as a `const`, which
keeps the tag short. To write it out in the attribute instead, as you would when
using the component, set `docs.source.objectProps` to `'inline'`:

```javascript
export default {
  component: Card,
  parameters: {
    docs: { source: { objectProps: 'inline' } },
  },
};
```

```astro
---
import Card from './Card.astro';
---
<Card
  media={{
    src: "/images/card.png",
    width: 600
  }}
  title="Title"
>
  Content
</Card>
```

It's an ordinary parameter, so it can go in `.storybook/preview.js` for every
story, on a component's meta as above, or on a single story. The snippet still
follows Controls. Set it back to `'frontmatter'` to restore the default for a
component or story.

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
