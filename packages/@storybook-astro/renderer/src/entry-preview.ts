// import 'astro/runtime/server/astro-island';

import * as astroRenderer from 'virtual:storybook-astro-renderer';
import { enhanceArgTypes } from 'storybook/internal/docs-tools';

import { defaultPreviewParameters } from './preview-defaults.ts';

export const parameters = {
  renderer: 'astro',
  ...defaultPreviewParameters,
};

function isAstroComponent(component: unknown): boolean {
  return (
    typeof component === 'function' &&
    component !== null &&
    'isAstroComponentFactory' in component &&
    (component as { isAstroComponentFactory: boolean }).isAstroComponentFactory === true
  );
}

// In static mode, Astro components are pre-rendered and cannot be re-rendered with different args.
// Disable controls for Astro components to prevent user confusion.
function disablePrerenderedControls(context: {
  component: unknown;
  argTypes: Record<string, Record<string, unknown>>;
}) {
  const { component, argTypes } = context;

  if (!isAstroComponent(component)) {
    return argTypes;
  }

  const disabledArgTypes: Record<string, Record<string, unknown>> = {};

  for (const [key, argType] of Object.entries(argTypes)) {
    disabledArgTypes[key] = { ...argType, control: false };
  }

  disabledArgTypes['_astroPrerendered'] = {
    name: 'Pre-rendered',
    description:
      'This Astro component is pre-rendered at build time. Controls are unavailable in static builds.',
    control: false,
    table: { category: 'ℹ️ Astro' },
  };

  return disabledArgTypes;
}

// `enhanceArgTypes` reads the component's `__docgenInfo` through
// `parameters.docs.extractArgTypes`, so it must run before the static-mode pass
// — otherwise the props it adds arrive too late to be disabled and would show
// live controls that do nothing (docs/specs/docgen.md#design-decisions).
export const argTypesEnhancers = [
  enhanceArgTypes,
  ...(astroRenderer.isStaticMode ? [disablePrerenderedControls] : []),
];

export { renderToCanvas, render } from './render.tsx';
export { applyDecorators } from './decorators.ts';
