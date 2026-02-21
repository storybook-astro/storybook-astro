import type { AstroIntegration } from 'astro';

export type RendererDeclaration = {
  server?: {
    name: string,
    entrypoint: string,
  },
  client?: {
    name: string,
    entrypoint: string,
  }
};

export abstract class Integration {
  abstract readonly name: string;
  abstract readonly dependencies: string[];
  abstract readonly options: Record<string | number | symbol, unknown>;
  abstract readonly renderer: RendererDeclaration;
  abstract readonly storybookEntryPreview?: string;

  abstract resolveClient(moduleName: string): string | undefined;
  abstract loadIntegration(resolveFrom?: string): Promise<AstroIntegration>;
}
