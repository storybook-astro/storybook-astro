# Storybook Astro AI Enhancements

Comprehensive AI-assisted development tools for the Storybook Astro monorepo, accessible to both Warp app users and Claude desktop users.

## Structure

```
.agents/
├── README.md (this file)
├── references/            # Project-specific documentation
│   ├── project-structure.md
│   ├── testing-guidelines.md
│   └── framework-standards.md
└── skills/               # AI skills for specific tasks
    ├── skill-creator/    # Create and validate new skills
    ├── create-pr/        # Generate PRs with proper conventions
    ├── code-reviewer/    # Review code for compliance
    ├── docs-reviewer/    # Review documentation quality
    └── test-generator/   # Generate test cases
```

## Skills Overview

### References (Supporting Documentation)

These documents provide context for AI assistants:

1. **project-structure.md**
   - Monorepo organization and workspace layout
   - File roles and naming conventions
   - Workspace commands and protocols
   - Development workflow for AI assistance

2. **testing-guidelines.md**
   - Vitest and portable stories patterns
   - Component testing across frameworks
   - Test organization and best practices
   - Coverage goals and debugging

3. **framework-standards.md**
   - Integration architecture and patterns
   - Per-framework guidelines (React, Vue, Svelte, Preact, Solid, Alpine)
   - Configuration and common pitfalls
   - Extension patterns

### Skills (Task-Specific Tools)

1. **skill-creator**
   - Create new skills for the project
   - Validate skill implementations
   - Test skills against project patterns
   - Best practices for Storybook Astro skills

2. **create-pr**
   - Generate GitHub PRs with proper formatting
   - Branching strategy and conventions
   - PR title validation
   - Body templates and examples

3. **code-reviewer**
   - Review code for architecture compliance
   - Framework integration validation
   - Testing coverage assessment
   - TypeScript/ESLint adherence

4. **docs-reviewer**
   - Review documentation completeness
   - Validate technical accuracy
   - Check consistency across docs
   - Ensure proper cross-references

5. **test-generator**
   - Generate test cases for components
   - Portable stories and Vitest patterns
   - Framework-specific testing approaches
   - Coverage and edge case handling

## Using Skills

### In Warp

Skills are automatically available in Warp when you're in this repository. Mention what you want to do:

```
\"Can you create a PR for my changes?\"
\"Review this code for compliance\"
\"Generate tests for my component\"
\"Improve the documentation\"
```

### In Claude

Read the appropriate SKILL.md file to activate the skill:

```
Read the create-pr skill to help me format my PR correctly
Use the code-reviewer skill to review these changes
```

Or explicitly request:

```
\"I want to create a PR. Use the create-pr skill.\"
```

## Key Concepts

### Monorepo Structure
Storybook Astro is a Yarn 4+ Berry monorepo with:
- 2 published npm packages (framework, renderer)
- 1 private app (website)
- 2 private integration examples (integration-astro6, integration-astro5)
- 1 component library
- ES modules throughout

### Framework Support
Six frameworks are fully integrated:
- React (@storybook/react-vite)
- Vue 3 (@storybook/vue3)
- Svelte (@storybook/svelte)
- Preact (@storybook/preact)
- Solid.js (storybook-solidjs)
- Alpine.js (custom integration)

### Testing Approach
- Portable stories API for testing outside Storybook
- Vitest with happy-dom environment
- 80%+ coverage targets
- Async/await patterns for Astro SSR

### Development Workflow
1. Create feature branch off `develop`
2. Make changes (code, tests, docs)
3. Pass linting and tests locally
4. Create PR with proper title
5. Get review and approval
6. Merge to `develop`
7. Release when ready

## Common Workflows

### Adding a New Framework Integration

1. Create `packages/@storybook-astro/framework/src/integrations/[framework].ts`
2. Extend `BaseIntegration` (see skill-creator or code-reviewer)
3. Add example components to both integration examples
4. Write tests (use test-generator skill)
5. Update `.storybook/main.js` in both integration examples
6. Create PR (use create-pr skill)
7. Get code review (use code-reviewer skill)

### Creating a New Component

1. Create `.astro`, `.jsx`, `.vue`, etc. file
2. Create story file (`.stories.jsx`)
3. Generate tests (use test-generator skill)
4. Ensure `yarn test` passes
5. Ensure `yarn lint` passes
6. Create PR (use create-pr skill)

### Improving Documentation

1. Update relevant file (AGENTS.md, reference guide, etc.)
2. Check with docs-reviewer skill
3. Create PR (use create-pr skill)
4. Include documentation updates in PRs for feature changes

## Important Notes

### Conventions

- **Always use explicit file extensions** in imports: `.ts`, `.tsx`, `.js`, `.jsx`
- **Use workspace protocol** for internal imports: `@storybook-astro/framework`
- **ES modules only** - no CommonJS
- **TypeScript first** - add types everywhere
- **Test coverage** - aim for 80%+

### Key Files

- **AGENTS.md** - Technical architecture and conventions (start here)
- **CONTRIBUTING.md** - Contribution process and code standards
- **package.json** - Workspace definition and scripts
- **.storybook/main.js** - Storybook and framework configuration

### Commands

```bash
# Test
yarn test

# Lint/Format
yarn lint
yarn lint:fix

# Build
yarn build:packages

# Storybook (pick an integration example)
yarn workspace @storybook-astro/integration-astro6 storybook
```

## When to Use Each Skill

| Task | Skill | Description |
|------|-------|-------------|
| Creating a new skill | **skill-creator** | Guides skill creation and validation |
| Making a PR | **create-pr** | Formats title and body properly |
| Code needs review | **code-reviewer** | Checks patterns and compliance |
| Documentation update | **docs-reviewer** | Validates docs quality |
| Need tests written | **test-generator** | Generates test cases |

## Getting Help

1. **Architecture questions**: Read `AGENTS.md`
2. **Workspace navigation**: Check `project-structure.md`
3. **Testing patterns**: See `testing-guidelines.md`
4. **Framework details**: Review `framework-standards.md`
5. **Code review feedback**: Use `code-reviewer` skill
6. **Documentation help**: Use `docs-reviewer` skill

## Maintenance

These enhancements should be updated when:

- New framework is added → Update `framework-standards.md`
- New pattern emerges → Update relevant reference or skill
- Project structure changes → Update `project-structure.md`
- Astro version updates → Check Astro 5/6 compatibility sections
- CI/testing changes → Update relevant documentation

## References

- `AGENTS.md` - Full technical guide
- `CONTRIBUTING.md` - Contribution guidelines
- `README.md` - Project overview
- `.claude/references/` - Supporting documentation
"