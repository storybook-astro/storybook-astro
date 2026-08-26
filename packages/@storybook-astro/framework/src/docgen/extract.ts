import { basename } from 'node:path';
import type ts from 'typescript';
import { readAstroPropsBinding } from './defaultValues.ts';
import { readComponentDescription } from './description.ts';
import { createDefaultPropFilter } from './propFilter.ts';
import { rewriteInterfaceToTypeAlias, unionConstituentsOfFirstDefault } from './propsDeclaration.ts';
import type {
  AstroDocgenInfo,
  AstroDocgenOptions,
  AstroDocgenProp,
  AstroDocgenPropType,
  DeclarationRef
} from './types.ts';
import type { AstroTsProject } from './tsProject.ts';
import { appendPropsProbes, buildVirtualSource, virtualFilePathFor } from './virtualFile.ts';

/** "An interface can only extend an object type … with statically known members." */
const INTERFACE_EXTENDS_NON_OBJECT = 2312;

/** Guards against `Tag extends HTMLTag = HTMLTag` expanding to every element. */
const MAX_UNION_CONSTITUENTS = 8;

// ts.TypeFlags.Undefined / ts.TypeFlags.Null, inlined so this module keeps
// importing TypeScript as a type only.
const TS_UNDEFINED_FLAG = 32768;
const TS_NULL_FLAG = 65536;

/**
 * Extracts docgen for one `.astro` component.
 *
 * Returns `null` only when there is nothing to look at — no frontmatter. A
 * component with frontmatter but no `Props` still yields its description with
 * an empty props table, because that description is most of the value for a
 * slot-only component (docs/specs/docgen.md#failure-modes).
 */
export function extractAstroDocgen(
  typescript: typeof ts,
  project: AstroTsProject,
  astroFilePath: string,
  astroSource: string,
  options: AstroDocgenOptions = {}
): AstroDocgenInfo | null {
  const virtualSource = buildVirtualSource(astroSource);

  if (virtualSource === null) {
    return null;
  }

  const displayName = basename(astroFilePath).replace(/\.astro$/, '');

  // Parsed without a checker first: this is cheap, and it tells us whether
  // there is a `Props` to instantiate before we involve the program at all.
  const parsed = typescript.createSourceFile(
    virtualFilePathFor(astroFilePath),
    virtualSource,
    typescript.ScriptTarget.Latest,
    true
  );

  const description = readComponentDescription(typescript, parsed);
  const propsDeclaration = findPropsDeclaration(typescript, parsed);

  if (!propsDeclaration) {
    return { displayName, description: description.text, tags: description.tags, props: {} };
  }

  const binding = readAstroPropsBinding(typescript, parsed);
  const properties = resolveProps(typescript, project, astroFilePath, virtualSource, parsed);

  const propFilter = options.propFilter ?? createDefaultPropFilter(binding.destructured);
  const props: Record<string, AstroDocgenProp> = {};

  for (const { symbol, checker } of properties) {
    const prop = buildProp(typescript, checker, symbol, binding.defaults);

    if (propFilter(prop, { name: displayName })) {
      props[prop.name] = prop;
    }
  }

  return { displayName, description: description.text, tags: description.tags, props };
}

/**
 * Instantiates `Props` and hands back its properties, merged across union
 * constituents. Rewrites the declaration and retries once when TypeScript
 * rejects the heritage clause (docs/specs/docgen.md#heritage-rewrite).
 */
function resolveProps(
  typescript: typeof ts,
  project: AstroTsProject,
  astroFilePath: string,
  virtualSource: string,
  parsed: ts.SourceFile
): Array<{ symbol: ts.Symbol; checker: ts.TypeChecker }> {
  const virtualPath = virtualFilePathFor(astroFilePath);
  const constituents = unionConstituentsOfFirstDefault(typescript, parsed, MAX_UNION_CONSTITUENTS);
  // The default instantiation goes first so props common to every constituent
  // keep their full type — `as` should read `"button" | "a"`, not whichever
  // constituent happened to be probed first. The per-constituent probes then
  // only contribute the props the collapsed union dropped.
  const typeArgumentSets =
    constituents.length > 1 ? [undefined, ...constituents] : [undefined];

  const read = (source: string) => {
    const probes = appendPropsProbes(source, typeArgumentSets);

    project.setVirtualFile(virtualPath, probes.source);

    const program = project.getProgram();
    const sourceFile = program?.getSourceFile(virtualPath);

    if (!program || !sourceFile) {
      return { properties: [], sourceFile: undefined, program: undefined, probes };
    }

    const checker = program.getTypeChecker();
    const seen = new Map<string, ts.Symbol>();

    for (const name of probes.names) {
      for (const symbol of propertiesOfProbe(typescript, checker, sourceFile, name)) {
        // First constituent to declare a prop wins; later ones only add.
        if (!seen.has(symbol.getName())) {
          seen.set(symbol.getName(), symbol);
        }
      }
    }

    return {
      properties: [...seen.values()].map((symbol) => ({ symbol, checker })),
      sourceFile,
      program,
      probes
    };
  };

  const first = read(virtualSource);

  if (!first.sourceFile || !first.program) {
    return first.properties;
  }

  // The rewrite is gated on the diagnostic rather than on an empty result:
  // a rejected heritage clause still leaves the members written inline, so
  // #110's Button comes back with `disabled` alone and looks like a success.
  const rejectedHeritage = first.program
    .getSemanticDiagnostics(first.sourceFile)
    .some((diagnostic) => diagnostic.code === INTERFACE_EXTENDS_NON_OBJECT);

  if (!rejectedHeritage) {
    return first.properties;
  }

  const rewritten = rewriteInterfaceToTypeAlias(typescript, virtualSource);

  if (rewritten === null) {
    return first.properties;
  }

  const retried = read(rewritten);

  // Only take the rewrite when it actually recovered something.
  return retried.properties.length > first.properties.length
    ? retried.properties
    : first.properties;
}

function propertiesOfProbe(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  probeName: string
): ts.Symbol[] {
  for (const statement of sourceFile.statements) {
    if (!typescript.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (typescript.isIdentifier(declaration.name) && declaration.name.text === probeName) {
        return checker.getTypeAtLocation(declaration.name).getApparentProperties();
      }
    }
  }

  return [];
}

function findPropsDeclaration(
  typescript: typeof ts,
  sourceFile: ts.SourceFile
): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
  return sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      (typescript.isInterfaceDeclaration(statement) ||
        typescript.isTypeAliasDeclaration(statement)) &&
      statement.name.text === 'Props'
  );
}

function buildProp(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  defaults: ReadonlyMap<string, string | number | boolean | null>
): AstroDocgenProp {
  const name = symbol.getName();
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const type = declaration
    ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
    : checker.getDeclaredTypeOfSymbol(symbol);

  const hasDefault = defaults.has(name);
  const optional = (symbol.flags & typescript.SymbolFlags.Optional) !== 0;
  const required = !optional && !hasDefault;

  return {
    name,
    required,
    type: describeType(checker, type, required),
    description: typescript.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
    defaultValue: hasDefault ? { value: defaults.get(name) ?? null } : null,
    parent: declarationRefOf(typescript, declaration),
    declarations: (symbol.declarations ?? [])
      .map((each) => declarationRefOf(typescript, each))
      .filter((each): each is DeclarationRef => each !== undefined),
    tags: jsDocTagsOf(typescript, symbol, checker)
  };
}

function describeType(
  checker: ts.TypeChecker,
  type: ts.Type,
  required: boolean
): AstroDocgenPropType {
  const raw = checker.typeToString(type);
  // Optional props read as `string | undefined`; the `?` already says that.
  const name = required ? raw : raw.replace(/\s*\|\s*undefined$/, '');

  if (!type.isUnion()) {
    return { name };
  }

  // An optional prop's type includes `undefined` under `strict`, which would
  // otherwise disqualify every optional literal union — i.e. most of them —
  // from becoming a select control.
  const meaningful = type.types.filter((constituent) => !isNullish(constituent));
  const literals = meaningful.filter((constituent) => constituent.isLiteral());

  if (literals.length === 0 || literals.length !== meaningful.length) {
    return { name, raw };
  }

  return {
    name: 'enum',
    raw: name,
    value: literals.map((constituent) => ({ value: checker.typeToString(constituent) }))
  };
}

/** `undefined` and `null` say nothing about which control a prop should get. */
function isNullish(type: ts.Type): boolean {
  return (
    (type.flags & (TS_UNDEFINED_FLAG | TS_NULL_FLAG)) !== 0
  );
}

function declarationRefOf(
  typescript: typeof ts,
  declaration: ts.Declaration | undefined
): DeclarationRef | undefined {
  if (!declaration) {
    return undefined;
  }

  const fileName = declaration.getSourceFile().fileName;
  const owner = declaration.parent;

  // Props coming from `VariantProps<typeof x>` are property assignments in an
  // object literal and have no declaring interface at all, so fall back to the
  // nearest named ancestor rather than reporting nothing — the prior art's
  // undefined `parent` is what makes the usual node_modules filter drop them.
  if (
    owner &&
    (typescript.isInterfaceDeclaration(owner) || typescript.isTypeAliasDeclaration(owner))
  ) {
    return { fileName, name: owner.name.text };
  }

  return { fileName, name: nearestNamedAncestor(typescript, declaration) };
}

function nearestNamedAncestor(typescript: typeof ts, declaration: ts.Declaration): string {
  let node: ts.Node | undefined = declaration.parent;

  while (node) {
    if (
      (typescript.isVariableDeclaration(node) ||
        typescript.isInterfaceDeclaration(node) ||
        typescript.isTypeAliasDeclaration(node) ||
        typescript.isClassDeclaration(node)) &&
      node.name &&
      typescript.isIdentifier(node.name)
    ) {
      return node.name.text;
    }

    node = node.parent;
  }

  return '';
}

function jsDocTagsOf(
  typescript: typeof ts,
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): Record<string, string> | undefined {
  const tags = symbol.getJsDocTags(checker);

  if (tags.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    tags.map((tag) => [tag.name, typescript.displayPartsToString(tag.text ?? []).trim()])
  );
}
