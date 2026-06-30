import type { WebRenderer } from 'storybook/internal/types';
import type { AstroComponentMarker } from './astroComponentMarker';

export {
  ASTRO_COMPONENT_MARKER,
  isAstroComponentMarker,
  isAstroComponentFactory,
  isAstroComponentSlot,
  serializeAstroComponentMarkers
} from './astroComponentMarker';
export type { AstroComponentMarker } from './astroComponentMarker';

/**
 * A child component placed in a slot together with its own props and slots — the
 * "configured component" slot value. After crossing the render boundary
 * `component` is a marker; in the testing/portable path it's a real factory. Its
 * `slots` are themselves {@link SlotValue}s, so configured components nest.
 */
export type AstroComponentSlot = {
  component: AstroComponentMarker | AstroComponentFactory;
  props?: Record<string, unknown>;
  slots?: Record<string, SlotValue>;
};

/** One slot entry: an HTML string, a component reference, or a configured component. */
type SingleSlotValue = string | AstroComponentMarker | AstroComponentFactory | AstroComponentSlot;

/** Slot content: a single entry, or a list of entries concatenated into one slot. */
export type SlotValue = SingleSlotValue | SingleSlotValue[];

/**
 * Mirrors the shape that the Astro language server gives to `.astro` imports:
 * a callable factory function with an optional `isAstroComponentFactory` marker.
 * Keeping this structurally compatible ensures that assigning an imported Astro
 * component to `component:` is clean under strict TypeScript / ESLint rules.
 */
export type AstroComponentFactory = {
  (result: unknown, props: unknown, slots: unknown): unknown | Promise<unknown>;
  isAstroComponentFactory?: boolean;
  moduleId?: string | undefined;
};

/**
 * Storybook renderer type for Astro components.
 *
 * Astro components are server-side rendered, so storyResult can be an Astro component
 * factory (routed to SSR), a string (HTML), or an HTMLElement (DOM node).
 */
export interface AstroRenderer extends WebRenderer {
  component: AstroComponentFactory | string | HTMLElement | ((...args: unknown[]) => unknown);
  storyResult: AstroComponentFactory | string | HTMLElement;
}

export type RenderComponentInput = {
  component: string;
  args: Record<string, unknown>;
  slots: Record<string, SlotValue>;
  story?: {
    id: string;
    title?: string;
    name?: string;
  };
};

export type RenderResponseMessage = {
  type: 'astro:render:response';
  data: {
    id: string;
    html: string;
  };
};

export type RenderRequestMessage = {
  type: 'astro:render:request';
  data: RenderComponentInput & {
    id: string;
  };
};

export type Message = RenderRequestMessage | RenderResponseMessage;

export type RenderPromise = {
  resolve: (value: RenderResponseMessage['data']) => void;
  reject: (reason?: unknown) => void;
  timeoutId: NodeJS.Timeout;
};

// Global type extensions
declare global {
  interface Window {
    preact?: {
      h: (type: string | ((props: Record<string, unknown>) => unknown), props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
      render: (element: unknown, container: HTMLElement) => void;
    };
    Alpine?: {
      start: () => void;
      _isStarted?: boolean;
    };
  }
}
