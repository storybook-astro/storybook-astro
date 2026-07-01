---
title: Overview
description: A plain-language explanation of how Storybook Astro renders Astro components inside Storybook.
---

This page explains, in plain terms, how Storybook Astro works and the main problem it had to solve. You don't need to be a developer to follow along. For the technical detail, see [Architecture](/how-it-works/architecture/).

## The two tools involved

**Astro** is a framework for building websites. Its standout idea is that it sends mostly plain HTML to the browser instead of shipping a lot of JavaScript. To do that, Astro components are turned into finished HTML *ahead of time* — on a server or during the build — rather than running live in the visitor's browser.

**Storybook** is a workshop for user-interface components. It lets you build, view, test, and document each component on its own, in isolation, so you can see exactly how it looks and behaves without running the whole app. Storybook does this work *inside the browser*.

## The challenge

Most UI frameworks — React, Vue, Svelte, and so on — are built to run in the browser. So when Storybook wants to show one of their components, it can simply run it right there on the page, the same way the real app would.

Astro components are different. They're designed to be turned into HTML *before* they ever reach the browser, and an Astro component will actively refuse to run in the browser at all. So Storybook can't just "play" an Astro component the way it plays a React one — the usual approach hits a wall.

## How Storybook Astro solves it

Storybook Astro renders each Astro component the same way Astro itself would — quietly, behind the scenes, the moment you open its story:

1. You open a story for an Astro component in Storybook.
2. Storybook Astro asks a small Astro renderer running in the background to build that component into finished HTML — exactly what a real Astro site would produce.
3. That HTML is handed back and dropped into Storybook's preview, so you see the genuine, production-like result.
4. The component's styling and any interactive scripts come along too, so it looks and behaves correctly.

This is possible because Astro itself ships a tool for exactly this purpose — the **Container API**. It lets you render a single Astro component to HTML on demand, without needing a whole website or build process around it. Storybook Astro uses that tool under the hood to produce each story's HTML.

The upshot: you get to develop and document Astro components in Storybook just like any other component, while still seeing true Astro output. As a bonus, the same setup lets Astro components live side by side with React, Vue, Svelte, Preact, Solid, and Alpine.js components in a single Storybook.

## Want the details?

The rest of this section goes deeper:

- [Architecture](/how-it-works/architecture/) — the two packages and how a render request flows through them
- [Dev Mode Rendering](/how-it-works/dev-mode/) — how rendering works while you develop
- [Static Builds](/how-it-works/static-builds/) — how stories are pre-rendered for a deployed Storybook
- [Framework Integration](/how-it-works/framework-integration/) — running Astro and UI-framework components together
- [Version Compatibility](/how-it-works/version-compatibility/) — supported Astro, Storybook, and Vite versions
