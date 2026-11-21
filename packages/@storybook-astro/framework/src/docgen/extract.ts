import { basename } from 'node:path';
import type ts from 'typescript';
import { literalValueOf, readAstroPropsBinding, type AstroPropsBinding } from './defaultValues.ts';
import { readComponentDescription } from './description.ts';
import { createDefaultPropFilter } from './propFilter.ts';
import { readSlots } from './slots.ts';
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

/** The component's `Props`, which decides whose JSDoc tags a prop takes. */
interface ComponentProps {
  file: ts.SourceFile;
  isUnion: boolean;
}

interface ComponentTag {
  name: string;
  text: string;
}

/**
 * Extracts docgen for one `.astro` component.
 *
 * Returns `null` only when there is nothing to look at: no frontmatter and no
 * slots. A component with frontmatter but no `Props` still yields its
 * description with an empty props table, because that description and its
 * slots are most of the value for a slot-only component
 * (docs/specs/docgen.md#failure-modes).
 */
export function extractAstroDocgen(
  typescript: typeof ts,
  project: AstroTsProject,
  astroFilePath: string,
  astroSource: string,
  options: AstroDocgenOptions = {}
): AstroDocgenInfo | null {
  const displayName = basename(astroFilePath).replace(/\.astro$/, '');
  const slots = readSlots(astroSource);
  const virtualSource = buildVirtualSource(astroSource);

  if (virtualSource === null) {
    return slots.length > 0 ? { displayName, description: '', props: {}, slots } : null;
  }

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
    return { displayName, description: description.text, tags: description.tags, props: {}, slots };
  }

  const binding = readAstroPropsBinding(typescript, parsed);
  const properties = resolveProps(typescript, project, astroFilePath, virtualSource, parsed);

  const propFilter = options.propFilter ?? createDefaultPropFilter(binding.destructured);
  const props: Record<string, AstroDocgenProp> = {};

  for (const { symbol, checker, componentProps } of properties) {
    const componentTags = componentTagsOf(typescript, symbol, checker, componentProps);

    // docs-tools looks for `@ignore` in the description, which holds no tags
    // here, so the extractor drops these itself (issue #356).
    if (componentTags.some((tag) => tag.name === 'ignore')) {
      continue;
    }

    const prop = buildProp(typescript, checker, symbol, componentTags, binding);

    if (propFilter(prop, { name: displayName })) {
      props[prop.name] = prop;
    }
  }

  return { displayName, description: description.text, tags: description.tags, props, slots };
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
): Array<{ symbol: ts.Symbol; checker: ts.TypeChecker; componentProps: ComponentProps }> {
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
    const propsName = findPropsDeclaration(typescript, sourceFile)?.name;
    const componentProps: ComponentProps = {
      file: sourceFile,
      isUnion: propsName ? checker.getTypeAtLocation(propsName).isUnion() : false
    };
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
      properties: [...seen.values()].map((symbol) => ({ symbol, checker, componentProps })),
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
  componentTags: ComponentTag[],
  { defaults }: AstroPropsBinding
): AstroDocgenProp {
  const name = symbol.getName();
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const type = declaration
    ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
    : checker.getDeclaredTypeOfSymbol(symbol);

  const tags = jsDocTagsOf(typescript, symbol, checker);
  const destructuringDefault = defaults.get(name);
  // A `@default` tag documents a default the destructuring doesn't show, such
  // as one applied further down the frontmatter (issue #371). Its text is the
  // source, and its value is parsed the way a destructuring default's is. It's
  // read from the component's tags, as `@ignore` is, so a base's tag doesn't
  // override the component's or show on a prop the component redeclares.
  const defaultTag = componentTags.find((tag) => tag.name === 'default')?.text;
  const tagDefault = defaultTag
    ? { value: defaultTagValue(typescript, defaultTag), source: defaultTag }
    : undefined;
  const optional = (symbol.flags & typescript.SymbolFlags.Optional) !== 0;
  // Only a destructuring default lets a caller leave the prop out; the tag is
  // documentation.
  const required = !optional && !destructuringDefault;

  return {
    name,
    required,
    type: describeType(typescript, checker, type, required),
    description: typescript.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
    defaultValue: destructuringDefault ?? tagDefault ?? null,
    parent: declarationRefOf(typescript, declaration),
    declarations: (symbol.declarations ?? [])
      .map((each) => declarationRefOf(typescript, each))
      .filter((each): each is DeclarationRef => each !== undefined),
    tags
  };
}

function describeType(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  type: ts.Type,
  required: boolean
): AstroDocgenPropType {
  const raw = checker.typeToString(type);
  // Optional props read as `string | undefined`; the `?` already says that.
  const withoutUndefined = (text: string) =>
    required ? text : text.replace(/\s*\|\s*undefined$/, '');
  const name = withoutUndefined(raw);
  // TypeScript shortens a long type to `{ ...; }` or `... 12 more ...`. That
  // suits the props table, but AI agents read the type to pick a valid value,
  // so the API description gets the whole text (issue #357). These are
  // typeToString's default flags plus NoTruncation.
  const fullText = withoutUndefined(
    checker.typeToString(
      type,
      undefined,
      typescript.TypeFormatFlags.NoTruncation |
        typescript.TypeFormatFlags.AllowUniqueESSymbolType |
        typescript.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    )
  );
  const result: AstroDocgenPropType = { name };

  if (fullText !== name) {
    result.untruncated = fullText;
  }

  if (!type.isUnion()) {
    return result;
  }

  // An optional prop's type includes `undefined` under `strict`, which would
  // otherwise disqualify every optional literal union — i.e. most of them —
  // from becoming a select control.
  const meaningful = type.types.filter((constituent) => !isNullish(constituent));
  const literals = meaningful.filter((constituent) => constituent.isLiteral());

  if (literals.length === 0 || literals.length !== meaningful.length) {
    return { ...result, raw };
  }

  // apiDescription prints a literal union from `value`, so it needs no
  // `untruncated`.
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

/**
 * The JSDoc tags that decide whether the component hides a prop (`@ignore`,
 * issues #356, #373) and what default it documents (`@default`, issue #371).
 *
 * When the prop is declared in the component's own `Props`, only those
 * declarations count. `symbol.getJsDocTags` can't make that distinction: it
 * falls back to a base interface's tags when an override has none, and merges
 * the tags of every declaration of an intersection's property, so a base's
 * `@ignore` or `@default` would apply to a prop the component redeclares.
 *
 * Otherwise the merged tags count: for a prop `Props` only inherits, they
 * include a base's tags however far up it is, and for a union `Props` each
 * constituent's, since a union alternative isn't an override.
 */
function componentTagsOf(
  typescript: typeof ts,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  componentProps: ComponentProps
): ComponentTag[] {
  const inProps = componentProps.isUnion
    ? []
    : (symbol.declarations ?? []).filter((declaration) =>
      isInComponentProps(typescript, declaration, componentProps.file)
    );

  if (inProps.length === 0) {
    return symbol.getJsDocTags(checker).map((tag) => ({
      name: tag.name,
      text: typescript.displayPartsToString(tag.text ?? []).trim()
    }));
  }

  return inProps.flatMap((declaration) =>
    typescript.getJSDocTags(declaration).map((tag) => ({
      name: tag.tagName.text,
      text: typescript.getTextOfJSDocComment(tag.comment)?.trim() ?? ''
    }))
  );
}

/**
 * Reads a `@default` tag's text as an expression, so `@default true` gives
 * `true` and `@default 'md'` gives `'md'`, as the same defaults written in the
 * destructuring do (issue #355). Text that isn't a single expression is kept
 * as written.
 */
function defaultTagValue(typescript: typeof ts, text: string): string | number | boolean | null {
  const sourceFile = typescript.createSourceFile(
    'default.ts',
    `(${text})`,
    typescript.ScriptTarget.Latest,
    true
  );
  const [statement] = sourceFile.statements;

  // Text that doesn't parse leaves more than one statement, or an expression
  // that doesn't span the whole text.
  if (
    sourceFile.statements.length !== 1 ||
    !typescript.isExpressionStatement(statement) ||
    !typescript.isParenthesizedExpression(statement.expression) ||
    statement.expression.expression.getText(sourceFile) !== text
  ) {
    return text;
  }

  return literalValueOf(typescript, statement.expression.expression, sourceFile);
}

/** Whether a declaration sits inside the component's top-level `Props`. */
function isInComponentProps(
  typescript: typeof ts,
  declaration: ts.Declaration,
  componentFile: ts.SourceFile
): boolean {
  if (declaration.getSourceFile() !== componentFile) {
    return false;
  }

  let statement: ts.Node = declaration;

  while (statement.parent && !typescript.isSourceFile(statement.parent)) {
    statement = statement.parent;
  }

  return (
    (typescript.isInterfaceDeclaration(statement) ||
      typescript.isTypeAliasDeclaration(statement)) &&
    statement.name.text === 'Props'
  );
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
