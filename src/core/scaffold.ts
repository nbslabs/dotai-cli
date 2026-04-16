import { join } from 'path'
import { readFile } from 'fs/promises'
import { ensureDir, writeTextFile, pathExists, readTextFile } from '../utils/fs'
import { logger } from '../utils/logger'

/**
 * Files that AI tools create natively with project instructions.
 * If any exist before dotai init, we merge their content into AI.md.
 */
const EXISTING_INSTRUCTION_FILES = [
  { path: 'CLAUDE.md', tool: 'Claude Code' },
  { path: 'GEMINI.md', tool: 'Gemini CLI' },
  { path: '.github/copilot-instructions.md', tool: 'GitHub Copilot' },
]

/**
 * Check for existing tool instruction files and collect their content.
 * Returns concatenated content from all found files, or empty string if none exist.
 */
export async function collectExistingInstructions(projectRoot: string): Promise<string> {
  const parts: string[] = []

  for (const file of EXISTING_INSTRUCTION_FILES) {
    const filePath = join(projectRoot, file.path)
    if (await pathExists(filePath)) {
      const content = (await readTextFile(filePath)).trim()
      if (content) {
        parts.push(`<!-- Imported from existing ${file.path} (${file.tool}) -->\n${content}`)
        logger.dim(`  Found existing ${file.path} — merging into AI.md`)
      }
    }
  }

  return parts.join('\n\n---\n\n')
}

interface ScaffoldOptions {
  projectName: string
  projectDescription: string
  aiDir: string
  tools: string[]
  /** Content from existing CLAUDE.md/GEMINI.md/AGENTS.md to merge into AI.md */
  existingContent?: string
}

interface TemplateFile {
  relPath: string          // relative to .ai/
  templateName: string     // template identifier
  content: string
  toolSpecific?: string[]  // only create if one of these tools is enabled
}

function getTemplateContent(templateName: string, vars: { projectName: string; projectDescription: string; projectRoot: string }): string {
  const templates: Record<string, string> = {
    'AI.md': `# AI Instructions — ${vars.projectName}

> This file is your single source of truth for all AI coding tools.
> It is symlinked to CLAUDE.md, GEMINI.md, AGENTS.md, and more by dotai.
> Edit this file — all tools stay in sync automatically.

---

## ⚡ Before You Start — Read the Knowledge Base

**IMPORTANT**: Before exploring the codebase or asking the user questions, read the
knowledge base files in \`.ai/knowledge/\`. They contain pre-scanned codebase context
that saves you from re-discovering what previous sessions already learned.

1. **Start with** \`.ai/knowledge/INDEX.md\` — module map, exports, and dependency graph
2. **Check** \`.ai/knowledge/gotchas.md\` — known edge cases and "never do X" rules
3. **Check** \`.ai/knowledge/patterns.md\` — recurring code patterns in this project
4. **Check** \`.ai/knowledge/changelog.md\` — recent code changes
5. **For deep context on a specific module**, read \`.ai/knowledge/modules/<name>.md\`

If the knowledge base does not exist yet, suggest the user runs:
\\\`\\\`\\\`bash
dotai knowledge scan
\\\`\\\`\\\`

## 🧠 Auto-Persist Rule (MANDATORY)

**YOU MUST FOLLOW THIS RULE AT ALL TIMES**:

Whenever you read, analyze, or modify code and discover something that is NOT already
in the knowledge base — **immediately persist it** by calling the \\\`knowledge_append\\\`
MCP tool (or the CLI equivalent). Do NOT wait for the user to ask. Do NOT batch findings.
Do NOT skip this step. Every non-obvious discovery must be persisted as soon as you make it.

**This is automatic behavior, not optional.** Treat it like writing to a log — it happens
as a side effect of your work, not as a separate step the user requests.

### What triggers auto-persist:
- You read a file and notice a non-obvious constraint or side effect
- You discover a hidden dependency between modules
- You fix or debug a bug and find the root cause was subtle
- You notice a pattern used consistently across multiple files
- You find that a particular approach does NOT work (saves future sessions from repeating mistakes)
- You encounter an undocumented API requirement or configuration rule
- You discover something that contradicts or is missing from the current knowledge base

### How to persist (in order of preference):
1. **MCP tool** — call \\\`knowledge_append\\\` directly (no user interaction needed)
2. **Shell command** — run \\\`dotai knowledge append --gotchas --finding "..." --agent "your-name"\\\`

### What NOT to persist:
- Information already in the knowledge base (check first)
- Trivially obvious things readable from the code itself
- Task-specific context that won't help future sessions

### Persist format:
- Be specific: include file names, function names, line references
- Explain WHY, not just WHAT
- Keep each finding under 3 sentences
- Use \\\`target: "gotchas"\\\` for edge cases, bugs, constraints
- Use \\\`target: "patterns"\\\` for recurring code patterns
- Use \\\`module: "<name>"\\\` for module-specific discoveries

## 📋 MCP Server Reference

If the dotai knowledge MCP server is configured, you have access to these tools:

| Tool | Description |
|------|-------------|
| \\\`knowledge_query\\\` | Search knowledge base by keyword |
| \\\`knowledge_get_module\\\` | Get full summary of a specific module |
| \\\`knowledge_list_modules\\\` | List all indexed modules |
| \\\`knowledge_recent_changes\\\` | Get recent codebase changes |
| \\\`knowledge_append\\\` | **Write back** a finding to persist across sessions |
| \\\`knowledge_explore\\\` | Read source files for deep analysis |
| \\\`knowledge_populate_ai_md\\\` | Update AI.md project sections with codebase-specific info |

---

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
| Install    | \\\`npm install\\\`     |
| Dev server | \\\`npm run dev\\\`     |
| Build      | \\\`npm run build\\\`   |
| Test       | \\\`npm test\\\`        |
| Lint       | \\\`npm run lint\\\`    |
-->

## Important Constraints

<!-- List hard rules the AI must NEVER violate. Be explicit — this reduces hallucination. -->
<!-- Example:
- NEVER modify files in the /generated/ directory — they are auto-generated
- NEVER use \\\`any\\\` type in TypeScript
- ALWAYS run tests before committing
- ALWAYS use the project's logger, never console.log in production code
- Database migrations must be backward-compatible
-->

## Common Pitfalls

<!-- Document gotchas the AI might not know about -->
<!-- Example:
- The API requires authentication headers on all routes except /health
- CSS modules are used — import styles as \\\`import styles from './file.module.css'\\\`
- The monorepo uses pnpm workspaces — use \\\`pnpm\\\` not \\\`npm\\\`
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



    'settings-claude.json': `{
  "permissions": {
    "allow": [],
    "deny": []
  },
  "mcpServers": {
    "dotai-knowledge": {
      "command": "npx",
      "args": ["dotai", "knowledge", "serve", "--stdio", "--project", "${vars.projectRoot}"]
    }
  }
}
`,

    'settings-gemini.json': `{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "npx",
      "args": ["dotai", "knowledge", "serve", "--stdio", "--project", "${vars.projectRoot}"]
    }
  }
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

    'review.toml': `description = "Review code changes and provide feedback"
prompt = """
Review the current code changes and provide:
1. A summary of changes
2. Potential issues or bugs
3. Suggestions for improvement
4. Security concerns if any

{{args}}
"""
`,

    'deploy.toml': `description = "Guide through the deployment process"
prompt = """
Guide through the deployment process:
1. Run all tests
2. Build the project
3. Check environment configuration
4. Deploy to the target environment

{{args}}
"""
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

    'learn.md': `# /learn

When you discover something important about the codebase that is not already documented,
persist it to the knowledge base so future sessions benefit immediately.

## Method 1 — MCP Tool (preferred)

If the \\\`dotai-knowledge\\\` MCP server is available, use the \\\`knowledge_append\\\` tool directly:

- **target**: "gotchas" (for edge cases, bugs, things to never do) or "patterns" (for recurring code patterns)
- **module**: module name if the finding is specific to one module (overrides target)
- **finding**: your discovery — be specific, include file/function names, explain WHY
- **agent**: your name (e.g. "claude", "gemini")

## Method 2 — Shell Command (always works)

### For general gotchas (edge cases, bugs fixed, things to never do):
Run: \\\`dotai knowledge append --gotchas --finding "<your discovery>" --agent "claude"\\\`

### For patterns (recurring code patterns you notice):
Run: \\\`dotai knowledge append --patterns --finding "<your discovery>" --agent "claude"\\\`

### For module-specific findings:
Run: \\\`dotai knowledge append --module <module-name> --finding "<your discovery>" --agent "claude"\\\`

## Guidelines for good findings:
- Be specific: include file names, function names, variable names
- Explain WHY, not just what
- Include the symptom if it's a gotcha (e.g. "causes X to fail when Y")
- Keep findings under 3 sentences each
- Do NOT persist things that are already in the knowledge base
- Do NOT persist things that are trivially obvious from reading the code
`,

    'knowledge-index.md': `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Codebase Knowledge Index
> Generated by dotai knowledge scan | Run \`dotai knowledge scan\` to update

This file has not been populated yet. Run:

\`\`\`bash
dotai knowledge scan
\`\`\`
`,

    'knowledge-patterns.md': `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Code Patterns

> Recurring patterns discovered in this codebase.
> Added by: dotai scanner, AI agents (/learn command), and humans.

<!-- Add patterns below. Format:
## Pattern Name
**Where used**: files or modules
**Description**: what the pattern is
**Example**: brief code example if helpful
-->
`,

    'knowledge-gotchas.md': `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Gotchas & Edge Cases

> Things that are NOT obvious from reading the code.
> Added by: dotai scanner, AI agents (/learn command), and humans.

<!-- Add gotchas below. Format:
## Gotcha Title
**Found in**: file or module
**Symptom**: what goes wrong if you violate this
**Rule**: what to always/never do
-->
`,

    'knowledge-changelog.md': `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Knowledge Changelog

> Automatically updated by dotai on each git commit (when hook is installed).
> Also updated manually via \`dotai knowledge update\`.

<!-- Entries are prepended (newest first) -->
`,

    'DOTAI.md': `# dotai — Quick Reference

> This file was generated by [dotai](https://github.com/nbslabs/dotai-cli). It explains what was created and how everything connects.

## What is dotai?

dotai manages your AI coding tool configurations from a single \`.ai/\` folder. Instead of maintaining separate config files for Claude, Gemini, Copilot, and Antigravity — you edit files in \`.ai/\` once and dotai symlinks them to where each tool expects them.

## Generated Structure

\`\`\`
.ai/                        ← Your source of truth (commit this to git)
├── AI.md                   ← Main instructions for ALL AI tools
├── DOTAI.md                ← This file — explains the setup
├── rules/                  ← Coding rules applied to agents
│   ├── general.md          ← Always-on general coding rules
│   ├── security.md         ← Security-focused rules
│   └── testing.md          ← Testing conventions
├── commands/               ← Custom slash commands (Claude Code, .md)
│   ├── review.md           ← /review command
│   ├── deploy.md           ← /deploy command
│   └── learn.md            ← /learn command (agent write-back)
├── commands-gemini/        ← Custom commands for Gemini CLI (.toml)
│   ├── review.toml         ← /review command
│   └── deploy.toml         ← /deploy command
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
├── ignore/                 ← Ignore patterns for AI tools
│   ├── .aiignore           ← Global ignore (all tools)

└── knowledge/              ← Persistent agent memory layer
    ├── INDEX.md            ← High-level codebase map
    ├── patterns.md         ← Recurring code patterns
    ├── gotchas.md          ← Edge cases and do-NOT rules
    ├── changelog.md        ← Recent code changes
    ├── modules/            ← Per-module deep summaries
    └── decisions/          ← Architecture decision records
\`\`\`

## How Symlinks Work

When you run \`dotai link\`, symlinks are created so each tool reads from \`.ai/\`:

| You edit (in .ai/)          | Tool sees it as                      | Used by             |
|-----------------------------|--------------------------------------|----------------------|
| \`AI.md\`                     | \`CLAUDE.md\`                          | Claude Code          |
| \`AI.md\`                     | \`GEMINI.md\`                          | Gemini CLI / Antigravity |
| \`AI.md\`                     | \`AGENTS.md\`                          | Antigravity          |
| \`AI.md\`                     | \`.github/copilot-instructions.md\`    | GitHub Copilot       |
| \`rules/\`                    | \`.gemini/rules/\`                     | Antigravity          |
| \`commands/\`                 | \`.claude/commands/\`                  | Claude Code          |
| \`commands-gemini/\`          | \`.gemini/commands/\`                  | Gemini CLI           |
| \`skills/\`                   | \`.claude/skills/\`                    | Claude Code          |
| \`skills/\`                   | \`.gemini/skills/\`                    | Gemini CLI           |
| \`skills/\`                   | \`.agents/skills/\`                    | Antigravity          |
| \`skills/\`                   | \`.github/skills/\`                    | GitHub Copilot       |
| \`workflows/\`                | \`.agents/workflows/\`                 | Antigravity          |
| \`knowledge/\`                | \`.claude/knowledge/\`                 | Claude Code          |
| \`knowledge/\`                | \`.gemini/knowledge/\`                 | Gemini / Antigravity |
| \`knowledge/\`                | \`.github/knowledge/\`                 | GitHub Copilot       |
| \`settings/claude.json\`      | \`.claude/settings.json\`              | Claude Code          |
| \`settings/gemini.json\`      | \`.gemini/settings.json\`              | Gemini CLI / Antigravity |
| \`ignore/.aiignore\`          | \`.geminiignore\`                      | Gemini CLI           |

## Knowledge Base (v2.0.0+)

dotai v2 adds a **persistent agent memory layer** at \`.ai/knowledge/\`. Every new
conversation starts with pre-built codebase knowledge already in context — no more
re-exploring the same code from scratch.

### Initialize

\`\`\`bash
dotai knowledge scan          # scan codebase → populate .ai/knowledge/
dotai knowledge hook install  # auto-update knowledge on every git commit
\`\`\`

### Step 2: Populate with Your AI Agent

\`dotai knowledge scan\` creates the knowledge **skeleton** (module files, index, basic exports).
The deep insights come from your **AI agent** using dotai MCP tools.

Open your AI agent and use this prompt:
\`\`\`
Use knowledge_explore to analyze the entire codebase directory by directory.
For each module, use knowledge_append to persist patterns, gotchas, and insights.
Then use knowledge_populate_ai_md to fill in the AI.md with project overview,
architecture, tech stack, key commands, constraints, and common pitfalls.
\`\`\`

> **Why two steps?** The CLI scanner is fast but shallow. AI agents understand
> semantics — they identify patterns, gotchas, and architecture that no static scanner can.

### Files in \`.ai/knowledge/\`

| File | Purpose | Updated by |
|------|---------|------------|
| \`INDEX.md\` | High-level module map + symbol table | Auto (scanner) |
| \`modules/<name>.md\` | Deep per-module summary | Auto (scanner) + humans/agents |
| \`patterns.md\` | Recurring code patterns | Humans + agents (/learn) |
| \`gotchas.md\` | Edge cases and do-NOT rules | Humans + agents (/learn) |
| \`changelog.md\` | Recent code changes | Auto (git hook) |
| \`decisions/*.md\` | Architecture decisions | Humans only |

### Agent Integration

All knowledge files are symlinked into Claude's \`.claude/knowledge/\`, Gemini's
\`.gemini/knowledge/\`, and Copilot's \`.github/knowledge/\`. Agents read these
automatically at the start of every conversation.

**Auto-Persist Rule**: The \`AI.md\` template instructs agents to IMMEDIATELY call
\`knowledge_append\` whenever they discover something non-obvious about the codebase.
This happens as a side-effect of their work — no user prompting needed.

Agents can also use the \`/learn\` command for manual write-back:
\`\`\`
/learn I discovered that PaymentService uses HALF_UP rounding — never change to HALF_EVEN
\`\`\`

For MCP-compatible clients (Claude Code), add to \`.ai/settings/claude.json\`:
\`\`\`json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "npx",
      "args": ["dotai", "knowledge", "serve", "--stdio"]
    }
  }
}
\`\`\`

This gives agents access to 7 MCP tools:

| Tool | Type | Description |
|------|------|-------------|
| \`knowledge_query\` | Read | Search the knowledge base by keyword |
| \`knowledge_get_module\` | Read | Get full summary of a specific module |
| \`knowledge_list_modules\` | Read | List all indexed modules |
| \`knowledge_recent_changes\` | Read | Get recent codebase changes |
| \`knowledge_append\` | Write | Persist a finding to the knowledge base |
| \`knowledge_explore\` | Read | Read source files for deep AI analysis |
| \`knowledge_populate_ai_md\` | Write | Update AI.md project sections from analysis |

### Troubleshooting: nvm + IDE-based tools (Antigravity)

If Node.js is installed via **nvm**, IDE-based tools may not find \`npx\`
because they don't load \`.bashrc\`. Fix by using the full path in your settings JSON:

\`\`\`json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "/home/YOUR_USER/.nvm/versions/node/vXX.XX.X/bin/npx",
      "args": ["dotai", "knowledge", "serve", "--stdio"],
      "env": {
        "PATH": "/home/YOUR_USER/.nvm/versions/node/vXX.XX.X/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
\`\`\`

Find your path with: \`which npx\`

## What to Edit

### Start here: \`.ai/AI.md\`
This is the most important file. Write your project context, architecture, tech stack, conventions, and constraints here. Every AI tool will see this content.

### Add rules: \`.ai/rules/\`
Add \`.md\` files for coding rules. Each rule file has YAML frontmatter with \`description\` and \`alwaysApply\` fields.

### Custom commands: \`.ai/commands/\` and \`.ai/commands-gemini/\`
Claude Code uses \`.md\` files in \`commands/\`. Gemini CLI uses \`.toml\` files in \`commands-gemini/\`. Each file becomes a slash command.

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
| \`dotai knowledge scan\`    | Scan codebase → generate .ai/knowledge/    |
| \`dotai knowledge watch\`   | Auto-update knowledge on file changes       |
| \`dotai knowledge serve\`   | Start MCP server for agent tool access      |
| \`dotai knowledge hook\`    | Manage git post-commit hook                 |
| \`dotai knowledge status\`  | Show knowledge base health                  |
| \`dotai knowledge append\`  | Add a finding to gotchas or module          |

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
  const vars = { projectName, projectDescription, projectRoot }
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
    { relPath: 'commands/learn.md', templateName: 'learn.md', content: '' },
    { relPath: 'commands-gemini/review.toml', templateName: 'review.toml', content: '', toolSpecific: ['gemini'] },
    { relPath: 'commands-gemini/deploy.toml', templateName: 'deploy.toml', content: '', toolSpecific: ['gemini'] },

    { relPath: 'prompts/example.prompt.md', templateName: 'example-prompt.md', content: '', toolSpecific: ['copilot'] },
    { relPath: 'instructions/backend.instructions.md', templateName: 'backend-instructions.md', content: '', toolSpecific: ['copilot'] },
    { relPath: 'settings/claude.json', templateName: 'settings-claude.json', content: '', toolSpecific: ['claude'] },
    { relPath: 'settings/gemini.json', templateName: 'settings-gemini.json', content: '', toolSpecific: ['gemini', 'antigravity'] },
    { relPath: 'ignore/.aiignore', templateName: 'aiignore', content: '' },

    { relPath: 'workflows/example.md', templateName: 'example-workflow.md', content: '', toolSpecific: ['antigravity'] },
    { relPath: 'knowledge/INDEX.md', templateName: 'knowledge-index.md', content: '' },
    { relPath: 'knowledge/patterns.md', templateName: 'knowledge-patterns.md', content: '' },
    { relPath: 'knowledge/gotchas.md', templateName: 'knowledge-gotchas.md', content: '' },
    { relPath: 'knowledge/changelog.md', templateName: 'knowledge-changelog.md', content: '' },
  ]

  // Create directories
  await ensureDir(aiPath)
  await ensureDir(join(aiPath, 'rules'))
  await ensureDir(join(aiPath, 'commands'))
  await ensureDir(join(aiPath, 'commands-gemini'))
  await ensureDir(join(aiPath, 'skills'))
  await ensureDir(join(aiPath, 'prompts'))
  await ensureDir(join(aiPath, 'instructions'))
  await ensureDir(join(aiPath, 'settings'))
  await ensureDir(join(aiPath, 'ignore'))
  await ensureDir(join(aiPath, 'workflows'))
  await ensureDir(join(aiPath, 'knowledge', 'modules'))
  await ensureDir(join(aiPath, 'knowledge', 'decisions'))
  // write .gitkeep to decisions/
  const gitkeepPath = join(aiPath, 'knowledge', 'decisions', '.gitkeep')
  if (!(await pathExists(gitkeepPath))) {
    await writeTextFile(gitkeepPath, '')
  }
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

    let content = getTemplateContent(file.templateName, vars)

    // For AI.md: append any imported content from existing instruction files
    if (file.relPath === 'AI.md' && options.existingContent) {
      content += '\n---\n\n## Imported Instructions\n\n'
        + '> The following content was imported from your existing AI tool instruction files\n'
        + '> during `dotai init`. Review and integrate into the sections above, then remove this block.\n\n'
        + options.existingContent + '\n'
    }

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
