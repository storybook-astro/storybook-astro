---
name: skill-creator
description: Create, test, and improve skills for the Storybook Astro development workflow. Use when users want to create a new skill for the project, improve existing skills, or validate skill functionality against project-specific patterns.
---

# Storybook Astro Skill Creator

A skill for creating and validating new AI skills customized for the Storybook Astro monorepo.

## Overview

This skill guides you through creating skills that integrate with Storybook Astro's development workflow. Skills should be:

- **Project-aware**: Understand monorepo structure (Yarn 4+ workspaces, ES modules)
- **Testing-compatible**: Leverage portable stories and Vitest patterns
- **Framework-aware**: Reference the 6 supported UI frameworks (React, Vue, Svelte, Preact, Solid, Alpine.js)
- **CI-aligned**: Compatible with linting, testing, and publishing workflows
- **Tool-neutral**: Work for Claude Code (through the `.claude/skills` symlink) and any other tool that reads `SKILL.md` files

## Where Skills Live

Skills live in `.agents/skills/<name>/SKILL.md`, and the background they share lives in `.agents/references/`. Claude Code finds the skills through `.claude/skills`, a symlink to `.agents/skills`. Always create and edit skills under `.agents/skills/`; don't add anything under `.claude/`.

## Creating a Skill

### Step 1: Define Intent

Start by understanding what the skill should do:

1. **What user action triggers this skill?** (e.g., "I need tests for my component")
2. **What should the skill produce?** (e.g., feedback, code, documentation)
3. **Are outputs objectively verifiable?** (Yes → include test cases; No → focus on quality guidance)
4. **Which project patterns does it reference?** (e.g., portable stories, integrations, Yarn commands)

### Step 2: Research Project Context

Before writing the skill, gather context:

- **Architecture and conventions**: `AGENTS.md`
- **Project Structure**: `.agents/references/project-structure.md`
- **Testing Patterns**: `.agents/references/testing-guidelines.md`
- **Framework Standards**: `.agents/references/framework-standards.md`
- **Existing Skills**: Other `.agents/skills/*/SKILL.md` files

If the skill follows a process documented elsewhere (as `release-manager` follows `docs/RELEASING.md`), read that doc and keep the skill in step with it.

### Step 3: Write SKILL.md

Create your skill in `.agents/skills/[skill-name]/SKILL.md`:

```yaml
---
name: skill-name
description: [2-3 sentences. Include when to trigger and what it does.]
allowed-tools: [List tools this skill uses, if restrictive]
---

# Skill Title

## Purpose
[What this skill enables]

## When to Use
[Specific triggers and contexts]

## Key Concepts
[Any domain knowledge needed]

## Workflow
[Step-by-step procedure]

## Examples
[Realistic usage scenarios]

## Output Format
[Expected results and structure]
```

**Keep SKILL.md focused on the task.** Move long background material into `.agents/references/` (shared) or a `references/` folder inside the skill, and point to it.

### Step 4: Include Project-Specific Guidance

For Storybook Astro skills, always include:

- **Monorepo navigation**: Which workspaces are relevant?
- **Yarn commands**: Run workspace scripts with `yarn workspace @storybook-astro/<name> <script>`; internal dependencies use `workspace:*` in package.json
- **Testing**: Reference portable stories, Vitest patterns
- **Frameworks**: Mention affected frameworks (React, Vue, etc.)
- **ESLint/TypeScript**: Align with `eslint.config.js` (flat config) and `tsconfig.base.json`

### Step 5: Create Supporting Files (Optional)

For complex skills, organize supporting files:

```
.agents/skills/[skill-name]/
├── SKILL.md           # Main instructions (required)
├── references/        # Detailed references
│   ├── pattern1.md
│   └── pattern2.md
└── scripts/           # Optional executables
    └── helper.js
```

Reference files from SKILL.md:
```markdown
See `references/detailed-pattern.md` for advanced configuration.
```

## Storybook Astro Skill Template

Use this template for project-specific skills:

```yaml
---
name: [skill-name]
description: [How to trigger, what it does. Mention Storybook Astro context.]
---

# [Skill Title]

## Purpose
[What problem does this solve in Storybook Astro development?]

## Context
This skill operates within:
- **Project**: Storybook Astro monorepo (Yarn 4+, ES modules)
- **Packages**: Framework and renderer packages
- **Frameworks**: React, Vue, Svelte, Preact, Solid.js, Alpine.js
- **Testing**: Vitest + portable stories
- **CI**: yarn lint, yarn lint:links, yarn build:packages, yarn test

## Key References
- `AGENTS.md` - Technical architecture
- `.agents/references/project-structure.md` - Workspace navigation
- `.agents/references/testing-guidelines.md` - Test patterns
- `.agents/references/framework-standards.md` - Framework integration patterns

## When to Use
[Specific triggers]

## Workflow
1. [Step 1]
2. [Step 2]
...

## Examples
[Realistic scenarios]

## Output Format
[Expected structure]
```

## Testing Skills

For skills with objectively verifiable outputs (code generation, validation, transformations):

1. **Create test cases** in `SKILL.md` with realistic examples
2. **Test against current codebase**: Run skill against actual project files
3. **Verify outputs**: Do generated files pass `yarn lint`? `yarn test`?
4. **Test edge cases**: What if user provides partial info? Wrong framework?

## Validation Checklist

Before finalizing a skill:

- [ ] SKILL.md lives in `.agents/skills/<name>/`
- [ ] SKILL.md metadata complete (name, description)
- [ ] Description explains when to trigger (2-3 sentences)
- [ ] References `.agents/references/` files appropriately
- [ ] Uses project-accurate terminology (workspaces, portable stories, etc.)
- [ ] Examples are realistic and grounded in actual Storybook Astro patterns
- [ ] Output format is clearly specified
- [ ] No URLs to internal only resources (unless properly documented)
- [ ] All framework references are accurate (6 frameworks, correct packages)
- [ ] Listed in the AGENTS.md Project Skills table and the `.agents/README.md` tree

## Common Skill Patterns

### Code Review/Validation Skill

Checks code against project standards:
- Reference `AGENTS.md` for conventions
- Check TypeScript, ESLint compliance
- Validate framework patterns
- Suggest fixes
- Don't present it as a substitute for the fresh-context `/code-review` AGENTS.md requires before a PR

### Documentation Skill

Writes or improves documentation:
- Maintain consistency with AGENTS.md style
- Update cross-references
- Include code examples from actual source

### Test Generation Skill

Creates tests using portable stories:
- Reference `testing-guidelines.md`
- Generate `.test.ts` files
- Use `composeStories`, `renderStory` patterns
- Ensure Vitest compatibility

### Generation Skill

Generates code files:
- Follow existing code patterns
- Use workspace imports correctly
- Include proper file extensions in imports
- Add TypeScript types

## Skill Lifecycle

1. **Creation**: Write `.agents/skills/[name]/SKILL.md` following this guide
2. **Registration**: Add the skill to the Project Skills table in AGENTS.md and to the `.agents/README.md` tree
3. **Testing**: Validate against real project scenarios
4. **Maintenance**: When a process changes, update the skill along with the doc it follows, so the two don't drift

## Dos and Don'ts

### Do
✓ Make skills specific to Storybook Astro patterns
✓ Reference the monorepo structure correctly
✓ Include examples from the actual codebase
✓ Keep descriptions concise but comprehensive
✓ Test skills against real scenarios
✓ Use project terminology (portable stories, workspace protocol, etc.)

### Don't
✗ Create generic skills that ignore project structure
✗ Make assumptions about monorepo organization
✗ Reference internal-only resources without documentation
✗ Include outdated Astro/Storybook version assumptions
✗ Assume all frameworks work the same (they don't)
✗ Skip edge case handling

## References

For guidance on skill writing:
- `AGENTS.md` - Project architecture, conventions, and the Project Skills table
- Existing skills in `.agents/skills/*/` - Pattern examples
- `.agents/references/` - Project-specific documentation
- [Anthropic Skills Guide](https://github.com/anthropics/skills) - General skill patterns
