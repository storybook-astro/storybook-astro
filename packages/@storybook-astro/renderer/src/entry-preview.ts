// import 'astro/runtime/server/astro-island';

export const parameters = { renderer: 'astro' };

function isAstroComponent(component: unknown): boolean {
  return (
    typeof component === 'function' &&
    component !== null &&
    'isAstroComponentFactory' in component &&
    (component as { isAstroComponentFactory: boolean }).isAstroComponentFactory === true
  );
}

const isProduction = import.meta.env.PROD;

// In production builds, disable controls for Astro components (they are pre-rendered).
export const argTypesEnhancers = isProduction
  ? [
      (context: { component: unknown; argTypes: Record<string, Record<string, unknown>> }) => {
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
      },
    ]
  : [];

export { renderToCanvas, render } from './render.tsx';
