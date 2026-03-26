import type { Plugin } from 'vite';

type CreateVirtualModulePluginOptions = {
  pluginName: string;
  virtualModuleId: string;
  load: (id: string) => string | Promise<string> | undefined;
};

export function createVirtualModulePlugin(options: CreateVirtualModulePluginOptions): Plugin {
  const resolvedVirtualModuleId = `\0${options.virtualModuleId}`;

  return {
    name: options.pluginName,
    resolveId(id) {
      if (id === options.virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        return options.load(id);
      }
    }
  } satisfies Plugin;
}
