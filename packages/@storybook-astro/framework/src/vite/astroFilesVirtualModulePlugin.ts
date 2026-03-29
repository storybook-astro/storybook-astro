import type { Plugin } from 'vite';
import { createVirtualModulePlugin } from './createVirtualModulePlugin.ts';

type ImportRecord = {
  id: string;
  file: string;
  importStatement: string;
};

export function astroFilesVirtualModulePlugin(astroComponents: string[]): Plugin {
  return createVirtualModulePlugin({
    pluginName: 'storybook-astro:virtual-astro-files',
    virtualModuleId: 'virtual:astro-files',
    load() {
      const imports = astroComponents.reduce<ImportRecord[]>((records, file, index) => {
        const moduleId = `_astroFile${index}`;

        return [
          ...records,
          {
            id: moduleId,
            file,
            importStatement: `import ${moduleId} from '${file}';`
          }
        ];
      }, []);

      return [
        imports.map(({ importStatement }) => importStatement).join('\n'),
        'export default {',
        imports.map(({ file, id }) => `'${file}': ${id}`).join(',\n'),
        '};'
      ].join('\n');
    }
  });
}
