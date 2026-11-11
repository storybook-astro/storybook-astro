# Storybook Astro AI Skills

Task-specific skills and the background they draw on, for Claude Code and any other tool that reads `SKILL.md` files. [AGENTS.md](../AGENTS.md) is the starting point: architecture, conventions, the PR checklist, and the [Project Skills](../AGENTS.md#project-skills) table that says when to use each skill.

## Structure

```
.agents/
├── README.md              # This file
├── references/            # Background the skills draw on
│   ├── project-structure.md
│   ├── testing-guidelines.md
│   └── framework-standards.md
└── skills/
    ├── release-manager/   # Releases, milestone and project board close-out
    ├── create-pr/         # PR titles, bodies and target branches
    ├── code-reviewer/     # Conventions check while you work (not the pre-PR review)
    ├── docs-reviewer/     # Reviewing AGENTS.md, docs/ and the website docs
    ├── test-generator/    # Component tests with portable stories
    └── skill-creator/     # Adding or changing a skill
```

## Using the skills

- **Claude Code** discovers them through `.claude/skills`, a symlink to `.agents/skills`. A skill triggers from its description, or you can run it by name (`/create-pr`, `/code-reviewer`, and so on).
- **Other tools** can read `.agents/skills/<name>/SKILL.md` directly.

`code-reviewer` checks a change against the project's conventions while you work. It does not replace the fresh-context `/code-review` that AGENTS.md requires in [Before Opening a PR](../AGENTS.md#before-opening-a-pr).

## Maintenance

- Add or change skills in `.agents/skills/`, never under `.claude/`, which only holds the symlink.
- List a new skill in the AGENTS.md Project Skills table and in the tree above.
- When a process changes, update the skill along with the doc it follows, so the two don't drift.
