import type { WebRenderer } from 'storybook/internal/types';

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

/** Minimal type for an Astro component factory as seen by the client-side renderer. */
export type AstroComponentFactory = {
  isAstroComponentFactory: boolean;
  moduleId?: string;
};

export type RenderComponentInput = {
  component: string;
  args: Record<string, unknown>;
  slots: Record<string, string>;
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
