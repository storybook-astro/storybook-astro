import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import typescript from 'typescript';
import { afterAll, describe, expect, test } from 'vitest';
import { createAstroTsProject } from './tsProject.ts';

const projectRoot = mkdtempSync(join(tmpdir(), 'astro-docgen-project-'));

afterAll(() => rmSync(projectRoot, { recursive: true, force: true }));

const compilerOptions: typescript.CompilerOptions = {
  target: typescript.ScriptTarget.Latest,
  module: typescript.ModuleKind.ESNext,
  moduleResolution: typescript.ModuleResolutionKind.Bundler,
  skipLibCheck: true
};

function createProject() {
  return createAstroTsProject(typescript, compilerOptions, projectRoot);
}

/** Names of the properties on `Props` as the checker sees them. */
function propNamesOf(program: typescript.Program, filePath: string): string[] {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);

  for (const statement of sourceFile?.statements ?? []) {
    if (typescript.isInterfaceDeclaration(statement) && statement.name.text === 'Props') {
      const symbol = checker.getSymbolAtLocation(statement.name);

      return checker
        .getDeclaredTypeOfSymbol(symbol!)
        .getApparentProperties()
        .map((property) => property.getName());
    }
  }

  return [];
}

describe('a component resolves imports from its own folder', () => {
  test('a relative type import is a real type, not a silently empty error type', () => {
    writeFileSync(
      join(projectRoot, 'variants.ts'),
      'export interface Variants { tone?: string; size?: number }\n'
    );

    const project = createProject();
    const componentPath = join(projectRoot, 'Sibling.astro.ts');

    project.setVirtualFile(
      componentPath,
      [
        "import type { Variants } from './variants.ts';",
        'interface Props extends Variants { title?: string }'
      ].join('\n')
    );

    expect(propNamesOf(project.getProgram()!, componentPath).sort()).toEqual([
      'size',
      'title',
      'tone'
    ]);

    project.dispose();
  });
});

describe('.astro imports resolve', () => {
  test('to a registered sibling component rather than failing to resolve', () => {
    const project = createProject();
    const parentPath = join(projectRoot, 'Parent.astro.ts');
    const childPath = join(projectRoot, 'Child.astro.ts');

    project.setVirtualFile(childPath, 'interface Props { label?: string }\nexport {};\n');
    project.setVirtualFile(
      parentPath,
      ["import Child from './Child.astro';", 'const used = Child;', 'export { used };'].join('\n')
    );

    const program = project.getProgram()!;
    const unresolved = program
      .getSemanticDiagnostics(program.getSourceFile(parentPath))
      .filter((diagnostic) => diagnostic.code === 2307);

    expect(unresolved).toHaveLength(0);

    project.dispose();
  });

  test('to the ambient shim when the component is not registered', () => {
    const project = createProject();
    const parentPath = join(projectRoot, 'Lonely.astro.ts');

    project.setVirtualFile(
      parentPath,
      ["import Missing from './NotRegistered.astro';", 'export { Missing };'].join('\n')
    );

    const program = project.getProgram()!;
    const unresolved = program
      .getSemanticDiagnostics(program.getSourceFile(parentPath))
      .filter((diagnostic) => diagnostic.code === 2307);

    expect(unresolved).toHaveLength(0);

    project.dispose();
  });
});

describe('Astro is in scope as a value', () => {
  test('so `Astro.props as Props` does not take the frontmatter down with it', () => {
    const project = createProject();
    const componentPath = join(projectRoot, 'Cast.astro.ts');

    project.setVirtualFile(
      componentPath,
      [
        'interface Props { title?: string }',
        'const { title } = Astro.props as Props;',
        'export { title };'
      ].join('\n')
    );

    const program = project.getProgram()!;
    // 2708 is "cannot use namespace 'Astro' as a value".
    const astroAsValue = program
      .getSemanticDiagnostics(program.getSourceFile(componentPath))
      .filter((diagnostic) => diagnostic.code === 2708);

    expect(astroAsValue).toHaveLength(0);

    project.dispose();
  });
});

describe('edits are picked up', () => {
  test('replacing a virtual file changes what the checker reports', () => {
    const project = createProject();
    const componentPath = join(projectRoot, 'Edited.astro.ts');

    project.setVirtualFile(componentPath, 'interface Props { before?: string }');
    expect(propNamesOf(project.getProgram()!, componentPath)).toEqual(['before']);

    project.setVirtualFile(componentPath, 'interface Props { after?: number }');
    expect(propNamesOf(project.getProgram()!, componentPath)).toEqual(['after']);

    project.dispose();
  });
});

describe('the service is shared, not rebuilt per component', () => {
  test('later components cost a fraction of the first', () => {
    const project = createProject();
    const paths: string[] = [];

    for (let index = 0; index < 6; index += 1) {
      const componentPath = join(projectRoot, `Perf${index}.astro.ts`);

      paths.push(componentPath);
      project.setVirtualFile(
        componentPath,
        `interface Props { label${index}?: string }\nexport {};\n`
      );
    }

    const timeOne = (componentPath: string) => {
      const started = performance.now();

      propNamesOf(project.getProgram()!, componentPath);

      return performance.now() - started;
    };

    const first = timeOne(paths[0]);
    const rest = paths.slice(1).map(timeOne);
    const slowestRest = Math.max(...rest);

    // The point of the shared service: warm-up is paid once. A program per
    // file would make every one of these cost roughly the same as the first.
    expect(slowestRest).toBeLessThan(Math.max(first / 4, 25));

    project.dispose();
  });
});
