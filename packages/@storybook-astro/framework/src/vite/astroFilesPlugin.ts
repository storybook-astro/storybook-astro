import type { Plugin } from 'vite';
import { createVirtualModule } from './virtualModulePlugin.ts';

type ImportRecord = {
  id: string;
  file: string;
  importStatement: string;
};

export function astroFilesPlugin(astroComponents: string[]): Plugin {
  return createVirtualModule({
    pluginName: 'storybook-astro:astro-files',
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
