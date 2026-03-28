import { join } from 'path'
import { readFile } from 'fs/promises'
import { ensureDir, writeTextFile, pathExists } from '../utils/fs'
import { logger } from '../utils/logger'

interface ScaffoldOptions {
  projectName: string
  projectDescription: string
  aiDir: string
  tools: string[]
}

interface TemplateFile {
  relPath: string          // relative to .ai/
  templateName: string     // template identifier
  content: string
  toolSpecific?: string[]  // only create if one of these tools is enabled
}

function getTemplateContent(templateName: string, vars: { projectName: string; projectDescription: string }): string {
  const templates: Record<string, string> = {
    'AI.md': `# AI Instructions — ${vars.projectName}

> This file is your single source of truth for all AI coding tools.
> It is symlinked to CLAUDE.md, GEMINI.md, AGENTS.md, and more by dotai.
> Edit this file — all tools stay in sync automatically.

## Project Overview

${vars.projectDescription || '<!-- Briefly describe what this project does and its primary purpose -->'}

## Architecture

<!-- Describe the high-level architecture. Be specific — vague descriptions cause hallucination. -->
<!-- Example:
- src/api/       — REST API routes (Express.js)
- src/services/  — Business logic layer
- src/models/    — Database models (PostgreSQL + Prisma)
- src/utils/     — Shared helper functions
-->

## Tech Stack

<!-- List every major technology with its version. AI agents perform better with explicit versions. -->
<!-- Example:
- Language: TypeScript 5.x
- Runtime: Node.js 20
- Framework: Next.js 14 (App Router)
- Database: PostgreSQL 16
- ORM: Prisma 5.x
- Testing: Vitest 2.x
-->

## Coding Conventions

- Follow existing patterns in the codebase — do not introduce new patterns without asking
- Use descriptive variable and function names; avoid abbreviations
- Write small, focused functions that do one thing
- Add comments only for non-obvious logic, not for what the code does
- Never commit secrets, API keys, or credentials
- Use environment variables for all configuration

## Key Commands

<!-- List the exact commands. AI agents should never guess commands. -->
<!-- Example:
| Action     | Command           |
|------------|-------------------|
| Install    | \`npm install\`     |
| Dev server | \`npm run dev\`     |
| Build      | \`npm run build\`   |
| Test       | \`npm test\`        |
| Lint       | \`npm run lint\`    |
-->

## Important Constraints

<!-- List hard rules the AI must NEVER violate. Be explicit — this reduces hallucination. -->
<!-- Example:
- NEVER modify files in the /generated/ directory — they are auto-generated
- NEVER use \`any\` type in TypeScript
- ALWAYS run tests before committing
- ALWAYS use the project's logger, never console.log in production code
- Database migrations must be backward-compatible
-->

## Common Pitfalls

<!-- Document gotchas the AI might not know about -->
<!-- Example:
- The API requires authentication headers on all routes except /health
- CSS modules are used — import styles as \`import styles from './file.module.css'\`
- The monorepo uses pnpm workspaces — use \`pnpm\` not \`npm\`
-->
`,

    'general.md': `---
description: General coding rules for this project
alwaysApply: true
---

# General Rules

- Follow the conventions in AGENTS.md
- Write clean, readable code with meaningful names
- Add comments for non-obvious logic only
`,

    'security.md': `---
description: Security rules for this project
alwaysApply: true
---

# Security Rules

- Never commit secrets, API keys, or credentials
- Use environment variables for sensitive configuration
- Validate all user inputs
- Apply least-privilege principle
`,

    'testing.md': `---
description: Testing conventions for this project
alwaysApply: false
---

# Testing Rules

- Write tests for all new features
- Follow the AAA pattern (Arrange, Act, Assert)
- Use descriptive test names that explain the expected behavior
`,

    'cursor-rule.mdc': `---
description: General coding rules for this project
alwaysApply: true
globs:
---

# General Rules

- Follow the conventions in AGENTS.md
- Write clean, readable code with meaningful names
- Add comments for non-obvious logic only
`,

    'settings-claude.json': `{
  "permissions": {
    "allow": [],
    "deny": []
  }
}
`,

    'settings-gemini.json': `{
}
`,

    'aiignore': `# Files and patterns to ignore for AI tools
node_modules/
dist/
build/
.env
.env.*
*.log
`,

    'codeiumignore': `# Windsurf-specific ignore patterns
node_modules/
dist/
build/
.env
`,

    'review.md': `# /review Command

Review the current code changes and provide:
1. A summary of changes
2. Potential issues or bugs
3. Suggestions for improvement
4. Security concerns if any
`,

    'deploy.md': `# /deploy Command

Guide through the deployment process:
1. Run all tests
2. Build the project
3. Check environment configuration
4. Deploy to the target environment
`,

    'example-skill.md': `# Example Skill

This is a template skill. Skills are reusable instruction sets that AI agents can reference.

## When to Use
- Describe when this skill should be applied

## Instructions
- Step-by-step instructions for the AI agent
`,

    'example-prompt.md': `---
description: Example prompt for GitHub Copilot
---

Describe the purpose and context for this prompt.
`,

    'backend-instructions.md': `---
description: Backend-specific coding instructions
applyTo: "src/backend/**,server/**,api/**"
---

# Backend Instructions

- Follow RESTful conventions
- Use proper error handling
- Log important operations
`,

    'example-workflow.md': `---
description: Example workflow for common tasks
---

# Example Workflow

1. Describe the first step
2. Describe the second step
3. Describe the final step
`,

    'DOTAI.md': `# dotai — Quick Reference

> This file was generated by [dotai](https://github.com/nbslabs/dotai-cli). It explains what was created and how everything connects.

## What is dotai?

dotai manages your AI coding tool configurations from a single \`.ai/\` folder. Instead of maintaining separate config files for Claude, Gemini, Cursor, Copilot, Windsurf, Codex, and Antigravity — you edit files in \`.ai/\` once and dotai symlinks them to where each tool expects them.

## Generated Structure

\`\`\`
.ai/                        ← Your source of truth (commit this to git)
├── AI.md                   ← Main instructions for ALL AI tools
├── DOTAI.md                ← This file — explains the setup
├── rules/                  ← Coding rules applied to agents
│   ├── general.md          ← Always-on general coding rules
│   ├── security.md         ← Security-focused rules
│   └── testing.md          ← Testing conventions
├── commands/               ← Custom slash commands
│   ├── review.md           ← /review command
│   └── deploy.md           ← /deploy command
├── skills/                 ← Reusable skill packages
│   └── example-skill/
│       └── SKILL.md
├── workflows/              ← Workflow definitions (Antigravity)
│   └── example.md
├── settings/               ← Per-tool JSON settings
│   ├── claude.json         ← Claude Code permissions & settings
│   └── gemini.json         ← Gemini CLI / Antigravity settings
├── prompts/                ← GitHub Copilot prompt files
├── instructions/           ← Copilot path-specific instructions
└── ignore/                 ← Ignore patterns for AI tools
    ├── .aiignore           ← Global ignore (all tools)
    └── .codeiumignore      ← Windsurf-specific ignore
\`\`\`

## How Symlinks Work

When you run \`dotai link\`, symlinks are created so each tool reads from \`.ai/\`:

| You edit (in .ai/)          | Tool sees it as                      | Used by             |
|-----------------------------|--------------------------------------|----------------------|
| \`AI.md\`                     | \`CLAUDE.md\`                          | Claude Code          |
| \`AI.md\`                     | \`GEMINI.md\`                          | Gemini CLI / Antigravity |
| \`AI.md\`                     | \`AGENTS.md\`                          | Windsurf, Codex      |
| \`AI.md\`                     | \`.github/copilot-instructions.md\`    | GitHub Copilot       |
| \`rules/\`                    | \`.cursor/rules/\`                     | Cursor               |
| \`rules/\`                    | \`.windsurf/rules/\`                   | Windsurf             |
| \`rules/\`                    | \`.gemini/rules/\`                     | Antigravity          |
| \`commands/\`                 | \`.claude/commands/\`                  | Claude Code          |
| \`commands/\`                 | \`.gemini/commands/\`                  | Gemini CLI           |
| \`skills/\`                   | \`.claude/skills/\`                    | Claude Code          |
| \`skills/\`                   | \`.agents/skills/\`                    | Antigravity          |
| \`workflows/\`                | \`.agents/workflows/\`                 | Antigravity          |
| \`settings/claude.json\`      | \`.claude/settings.json\`              | Claude Code          |
| \`settings/gemini.json\`      | \`.gemini/settings.json\`              | Gemini CLI / Antigravity |
| \`ignore/.aiignore\`          | \`.geminiignore\`                      | Gemini CLI           |
| \`ignore/.codeiumignore\`     | \`.codeiumignore\`                     | Windsurf             |

## What to Edit

### Start here: \`.ai/AI.md\`
This is the most important file. Write your project context, architecture, tech stack, conventions, and constraints here. Every AI tool will see this content.

### Add rules: \`.ai/rules/\`
Add \`.md\` files for coding rules. Each rule file has YAML frontmatter with \`description\` and \`alwaysApply\` fields. Tools like Cursor and Windsurf read these automatically.

### Custom commands: \`.ai/commands/\`
Define slash commands that Claude and Gemini can execute. Each \`.md\` file becomes a \`/command\`.

### Workflows: \`.ai/workflows/\`
Define step-by-step workflows for Antigravity. Each \`.md\` file has a \`description\` in YAML frontmatter and markdown steps.

### Settings: \`.ai/settings/\`
JSON config files for specific tools (permissions, preferences).

## Useful Commands

| Command              | What it does                              |
|----------------------|-------------------------------------------|
| \`dotai status\`       | Check which tools are linked              |
| \`dotai link\`         | Create/refresh all symlinks               |
| \`dotai unlink\`       | Remove symlinks (restore originals)       |
| \`dotai add <tool>\`   | Add a new tool to the project             |
| \`dotai remove <tool>\`| Remove a tool and clean up                |
| \`dotai sync\`         | Fix broken or missing symlinks            |
| \`dotai doctor\`       | Diagnose and auto-fix all issues          |
| \`dotai list --all\`   | Show all supported tools                  |

## Git Rules

- **Commit** \`.ai/\` — it is your source of truth
- **Do NOT commit** the symlinked dirs (\`.claude/\`, \`.gemini/\`, etc.) — dotai adds these to \`.gitignore\`
- After cloning, run \`dotai link\` to recreate symlinks
`,
  }

  return templates[templateName] || ''
}

/**
 * Scaffold the .ai/ directory structure with template files.
 */
export async function scaffoldAiDir(
  projectRoot: string,
  options: ScaffoldOptions
): Promise<string[]> {
  const { projectName, projectDescription, aiDir, tools } = options
  const aiPath = join(projectRoot, aiDir)
  const vars = { projectName, projectDescription }
  const createdFiles: string[] = []

  // Define the file structure
  const files: TemplateFile[] = [
    { relPath: 'AI.md', templateName: 'AI.md', content: '' },
    { relPath: 'DOTAI.md', templateName: 'DOTAI.md', content: '' },
    { relPath: 'rules/general.md', templateName: 'general.md', content: '' },
    { relPath: 'rules/security.md', templateName: 'security.md', content: '' },
    { relPath: 'rules/testing.md', templateName: 'testing.md', content: '' },
    { relPath: 'commands/review.md', templateName: 'review.md', content: '' },
    { relPath: 'commands/deploy.md', templateName: 'deploy.md', content: '' },
    { relPath: 'skills/example-skill/SKILL.md', templateName: 'example-skill.md', content: '' },
    { relPath: 'prompts/example.prompt.md', templateName: 'example-prompt.md', content: '', toolSpecific: ['copilot'] },
    { relPath: 'instructions/backend.instructions.md', templateName: 'backend-instructions.md', content: '', toolSpecific: ['copilot'] },
    { relPath: 'settings/claude.json', templateName: 'settings-claude.json', content: '', toolSpecific: ['claude'] },
    { relPath: 'settings/gemini.json', templateName: 'settings-gemini.json', content: '', toolSpecific: ['gemini', 'antigravity'] },
    { relPath: 'ignore/.aiignore', templateName: 'aiignore', content: '' },
    { relPath: 'ignore/.codeiumignore', templateName: 'codeiumignore', content: '', toolSpecific: ['windsurf'] },
    { relPath: 'workflows/example.md', templateName: 'example-workflow.md', content: '', toolSpecific: ['antigravity'] },
  ]

  // Create directories
  await ensureDir(aiPath)
  await ensureDir(join(aiPath, 'rules'))
  await ensureDir(join(aiPath, 'commands'))
  await ensureDir(join(aiPath, 'skills', 'example-skill'))
  await ensureDir(join(aiPath, 'prompts'))
  await ensureDir(join(aiPath, 'instructions'))
  await ensureDir(join(aiPath, 'settings'))
  await ensureDir(join(aiPath, 'ignore'))
  await ensureDir(join(aiPath, 'workflows'))

  // Create files
  for (const file of files) {
    // Skip tool-specific files if the tool isn't enabled
    if (file.toolSpecific && !file.toolSpecific.some((t) => tools.includes(t))) {
      continue
    }

    const filePath = join(aiPath, file.relPath)

    // Don't overwrite existing files
    if (await pathExists(filePath)) {
      continue
    }

    const content = getTemplateContent(file.templateName, vars)
    await writeTextFile(filePath, content)
    createdFiles.push(join(aiDir, file.relPath))
    logger.success(join(aiDir, file.relPath))
  }

  return createdFiles
}

/**
 * Update the project's .gitignore with dotai entries.
 */
export async function updateGitignore(
  projectRoot: string,
  entries: string[]
): Promise<number> {
  if (entries.length === 0) return 0

  const gitignorePath = join(projectRoot, '.gitignore')
  let existing = ''

  if (await pathExists(gitignorePath)) {
    const { readFile } = await import('fs/promises')
    existing = await readFile(gitignorePath, 'utf-8')
  }

  const existingLines = new Set(existing.split('\n').map((l) => l.trim()))
  const newEntries: string[] = []

  for (const entry of entries) {
    if (!existingLines.has(entry)) {
      newEntries.push(entry)
    }
  }

  if (newEntries.length === 0) return 0

  const header = '\n# dotai — tool dirs are symlinks, managed by dotai\n'
  const additions = header + newEntries.join('\n') + '\n'

  await writeTextFile(gitignorePath, existing + additions)
  return newEntries.length
}
