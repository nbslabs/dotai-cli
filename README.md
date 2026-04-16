<p align="center">
  <h1 align="center">dotai</h1>
  <p align="center"><strong>One <code>.ai/</code> folder. All your AI tools. Always in sync. Always in context.</strong></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nbslabs/dotai"><img src="https://img.shields.io/npm/v/@nbslabs/dotai.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@nbslabs/dotai"><img src="https://img.shields.io/npm/dm/@nbslabs/dotai.svg" alt="npm downloads"></a>
  <a href="https://github.com/nbslabs/dotai-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="node version"></a>
</p>

---

AI coding tools each expect their own config directory — `.claude/`, `.gemini/`, `.github/`, `.agents/`. **dotai** creates a single `.ai/` directory as your source of truth and symlinks everything to where each tool expects it.

Edit one file. Every tool stays in sync.

## What's New in v3.0.0 — Spec-Driven Development

dotai is now a complete ecosystem for AI-driven development. The new **SDD Toolkit** introduces a structured, 8-phase workflow where AI agents implement features from human-reviewed specifications — every piece of generated code traces back to an approved spec.

```
Idea → Requirements → Tasks → Plans → Implement → Evaluate → Review → Context-sync
  👤       🤖           🤖       🤖       🤖          🤖         🤖🔍       🤖
```

**Human review checkpoints** at requirements, tasks, plans, and final review ensure the AI never drifts from what you actually want.

```bash
dotai sdd init                    # scaffold SDD skills + commands
dotai sdd new my-feature           # create feature from template
# Then use /sdd-specify, /sdd-decompose, /sdd-plan, etc.
```

### Also supports
- **Gemini CLI** — Google's CLI-based AI assistant
- **Antigravity** — Google's IDE-integrated AI agent
- **Claude Code** — Anthropic's terminal-native coding assistant
- **GitHub Copilot** — GitHub's AI pair programmer

## Why dotai?

Without dotai, you juggle:

```
CLAUDE.md            ← Claude Code reads this
GEMINI.md            ← Gemini CLI reads this
.github/copilot-instructions.md  ← Copilot reads this
.gemini/rules/       ← Antigravity reads this
```

With dotai:

```
.ai/AI.md  →  symlinked to all of the above
```

One file to write. Four tools that read it. Zero drift.

## Quick Start

```bash
# Install globally
npm install -g @nbslabs/dotai

# Initialize in your project
cd your-project
dotai init

# That's it — your .ai/ folder is ready and symlinks are created
```

## How It Works

```
.ai/                           Your source of truth (committed to git)
├── AI.md               ──→    CLAUDE.md, GEMINI.md, AGENTS.md,
│                               .github/copilot-instructions.md
├── DOTAI.md                   Quick reference guide (this explains your setup)
├── rules/              ──→    .gemini/rules/
├── commands/           ──→    .claude/commands/
├── commands-gemini/    ──→    .gemini/commands/ (Gemini uses .toml format)
├── skills/             ──→    .claude/skills/, .gemini/skills/,
│                               .agents/skills/, .github/skills/
├── workflows/          ──→    .agents/workflows/
├── knowledge/          ──→    .claude/knowledge/, .gemini/knowledge/, .github/knowledge/
├── settings/
│   ├── claude.json     ──→    .claude/settings.json
│   └── gemini.json     ──→    .gemini/settings.json
└── ignore/
    └── .aiignore       ──→    .geminiignore
```

## Commands

| Command | Description |
|---|---|
| `dotai init` | Scaffold `.ai/` directory, or restore from existing `.dotai.json` |
| `dotai link [tools...]` | Create symlinks for specified or all configured tools |
| `dotai unlink [tools...]` | Remove symlinks, optionally restore backed-up originals |
| `dotai status` | Show the current state of every symlink |
| `dotai add <tool>` | Add a new tool to an existing project |
| `dotai remove <tool>` | Remove a tool and clean up its symlinks |
| `dotai list` | List all supported tools and their link status |
| `dotai sync` | Re-evaluate and repair all symlinks |
| `dotai doctor` | Run diagnostics and auto-fix issues |
| `dotai sdd init` | Scaffold SDD toolkit (skills, commands, templates) |
| `dotai sdd new <name>` | Create a new feature directory from template |
| `dotai sdd list` | List all features and their current phase |
| `dotai sdd status [name]` | Show detailed phase progress for a feature |

## Supported Tools

| ID | Tool | Native Dir | What Gets Symlinked |
|---|---|---|---|
| `claude` | Claude Code | `.claude/` | AI.md, settings, commands, skills, **knowledge** |
| `gemini` | Gemini CLI | `.gemini/` | AI.md, settings, commands (.toml), skills, ignore, **knowledge** |
| `copilot` | GitHub Copilot | `.github/` | AI.md, prompts, instructions, skills, **knowledge** |
| `antigravity` | Antigravity | `.gemini/` | AI.md, AGENTS.md, settings, rules, workflows, skills, **knowledge** |

## Knowledge Base

`dotai knowledge` builds and maintains a persistent codebase memory layer at `.ai/knowledge/`.

### Quick Start

```bash
dotai knowledge scan          # scan codebase → .ai/knowledge/
dotai knowledge hook install  # auto-update after each git commit
```

### Step 2: Populate with Your AI Agent

`dotai knowledge scan` creates the knowledge **skeleton** — module files, an index,
and basic exports. But the deep insights (architecture, patterns, gotchas) come from
your **AI agent** using the dotai MCP tools.

Open your AI agent (Gemini, Claude, Antigravity, etc.) and use one of these prompts:

**Full knowledge population:**
```
Use knowledge_explore to analyze the entire codebase directory by directory.
For each module, use knowledge_append to persist patterns, gotchas, and insights.
Then use knowledge_populate_ai_md to fill in the AI.md with project overview,
architecture, tech stack, key commands, constraints, and common pitfalls.
```

**Quick module deep-dive:**
```
Use knowledge_explore to read src/core/ and analyze the code deeply. Persist
every non-obvious finding (hidden dependencies, edge cases, patterns) using
knowledge_append. Focus on things that would surprise a new developer.
```

**AI.md population only:**
```
Explore the codebase using knowledge_explore, then call knowledge_populate_ai_md
to fill in the Project Overview, Architecture, Tech Stack, Key Commands,
Important Constraints, and Common Pitfalls sections of AI.md.
```

> **Why two steps?** The CLI scanner is fast but shallow — it extracts exports,
> file structure, and dependencies. AI agents understand *semantics* — they can
> identify patterns, gotchas, and architectural decisions that no static scanner can.

### Knowledge Commands

| Command | Description |
|---|---|
| `dotai knowledge scan` | Full codebase scan → generate/update knowledge files |
| `dotai knowledge scan --module <path>` | Incremental scan of one module |
| `dotai knowledge update` | Update from last git commit changes |
| `dotai knowledge watch` | Watch mode — update on file save |
| `dotai knowledge serve` | MCP stdio server (runs independently, no init required) |
| `dotai knowledge hook install` | Install git post-commit hook (auto-amends knowledge into commits) |
| `dotai knowledge hook uninstall` | Remove git post-commit hook |
| `dotai knowledge status` | Show knowledge base health + staleness |
| `dotai knowledge append` | Add a finding to gotchas or a module |
| `dotai knowledge clean` | Delete knowledge base (re-scan fresh) |

### MCP Integration

The MCP server runs **independently** — no `dotai init` required. It auto-creates
the knowledge directory if missing. Add to `.ai/settings/claude.json`:

```json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "npx",
      "args": ["dotai", "knowledge", "serve", "--stdio"]
    }
  }
}
```

> **IDE tools (Antigravity)**: Add `"--project", "/path/to/your/project"`
> to the `args` array. IDE-spawned processes may not use your project as the working directory.

Agents then have access to 7 MCP tools:

| Tool | Direction | Description |
|------|-----------|-------------|
| `knowledge_query` | 📖 Read | Search the knowledge base by keyword |
| `knowledge_get_module` | 📖 Read | Get full summary of a specific module |
| `knowledge_list_modules` | 📖 Read | List all indexed modules |
| `knowledge_recent_changes` | 📖 Read | Get recent codebase changes |
| `knowledge_append` | Write | Persist a finding (auto-creates missing files) |
| `knowledge_explore` | 📖 Read | Read source files for deep AI analysis |
| `knowledge_populate_ai_md` | ✏️ Write | Update AI.md project sections from codebase analysis |

### Auto-Persist: How Agents Write Back

The `AI.md` template includes a **mandatory auto-persist rule**. When an agent
reads or modifies code and discovers something non-obvious (a gotcha, a hidden
dependency, a pattern), it is instructed to **immediately** call `knowledge_append`
without waiting for user prompts.

Persistence happens during the session as a side-effect of work — not at session
close. This means knowledge accumulates across conversations automatically:

```
Session 1:  Agent discovers 10 things → persists 8 → knowledge base grows
Session 2:  Agent reads knowledge → starts smart → discovers more → persists again
Session 3:  Even richer context from line one
```

Agents can also be prompted explicitly:
```
/learn The PaymentService.processRefund() requires ROLE_ADMIN — calling without it throws 403 silently
```

### Troubleshooting: nvm + IDE-based tools

If Node.js is installed via **nvm**, IDE-spawned tools (Antigravity) can't find `npx`
because they don't load `.bashrc`. Use the full path + explicit `env` in your settings JSON:

```json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "/home/YOUR_USER/.nvm/versions/node/vXX.XX.X/bin/npx",
      "args": ["dotai", "knowledge", "serve", "--stdio", "--project", "/path/to/your/project"],
      "env": {
        "PATH": "/home/YOUR_USER/.nvm/versions/node/vXX.XX.X/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Find your path: `which npx`

### Developer Workflow

**One-time setup:**
```bash
dotai init                        # 1. create .ai/ + symlinks
dotai knowledge scan              # 2. generate knowledge skeleton
dotai knowledge hook install      # 3. auto-update on every commit
# 4. Ask your agent: "Explore the codebase and populate the knowledge base"
```

**Daily workflow:**
```
Code normally → git commit → hook auto-updates knowledge + amends silently
→ Open AI agent → reads knowledge → starts smart → discovers more → auto-persists
```

> The git hook amends knowledge changes into each commit automatically.
> No extra commits, no dirty diffs.

## SDD Toolkit

`dotai sdd` brings Spec-Driven Development (SDD) to your project — a structured workflow where every piece of AI-generated code traces back to a human-reviewed specification.

### The 8-Phase Workflow

```
Phase 1: Initiate     → Human writes idea.md
Phase 2: Specify      → Agent generates requirements.md       ← Human review
Phase 3: Decompose    → Agent breaks into tasks/*.task.md     ← Human review
Phase 4: Plan         → Agent generates plans + evaluation    ← Human review
Phase 5: Implement    → Agent implements following the plan
Phase 6: Evaluate     → Agent verifies against acceptance criteria
Phase 7: Review       → Agent produces holistic code review   ← Human review
Phase 8: Context-sync → Agent updates .ai/knowledge/
```

### Quick Start

```bash
# 1. Initialize SDD toolkit
dotai sdd init

# 2. Create a new feature
dotai sdd new user-authentication

# 3. Write your idea
# Edit .ai/sdd/user-authentication/idea.md

# 4. Run phases using your AI tool's native commands:
#    Claude: /sdd-specify user-authentication
#    Gemini: /sdd-specify user-authentication
#    Copilot: Use prompt sdd-specify
#    Antigravity: Use workflow sdd-specify
```

### SDD Commands

| Command | Description |
|---|---|
| `dotai sdd init` | Scaffold skills, templates, and 28 cross-tool commands |
| `dotai sdd init --force` | Re-write skills and commands (preserves feature dirs) |
| `dotai sdd new <name>` | Create a new feature directory from template |
| `dotai sdd list` | List all features with their current phase |
| `dotai sdd status [name]` | Show phase-by-phase progress for a feature |

### Cross-Tool Phase Commands

SDD generates native commands for all 4 supported tools:

| Phase | Claude / Gemini | Copilot | Antigravity |
|---|---|---|---|
| Specify | `/sdd-specify` | Prompt `sdd-specify` | Workflow `sdd-specify` |
| Decompose | `/sdd-decompose` | Prompt `sdd-decompose` | Workflow `sdd-decompose` |
| Plan | `/sdd-plan` | Prompt `sdd-plan` | Workflow `sdd-plan` |
| Implement | `/sdd-implement` | Prompt `sdd-implement` | Workflow `sdd-implement` |
| Evaluate | `/sdd-evaluate` | Prompt `sdd-evaluate` | Workflow `sdd-evaluate` |
| Review | `/sdd-review` | Prompt `sdd-review` | Workflow `sdd-review` |
| Sync | `/sdd-sync` | Prompt `sdd-sync` | Workflow `sdd-sync` |

### Feature Directory Structure

```
.ai/sdd/my-feature/
├── idea.md                        ← Phase 1: you write this
├── requirements.md                ← Phase 2: agent generates
├── tasks/
│   ├── 01_user_auth.task.md       ← Phase 3: agent generates
│   └── 02_api_routes.task.md
├── plans/
│   ├── 01_user_auth.plan.md       ← Phase 4: agent generates
│   └── 02_api_routes.plan.md
├── evaluation/
│   ├── 01_user_auth.evaluation.md ← Phase 4: acceptance criteria
│   ├── 01_user_auth.result.md     ← Phase 6: pass/fail verdict
│   └── ...
└── code-review.md                 ← Phase 7: holistic review
```

## Usage

### Initialize a new project (interactive)
```bash
dotai init
```

> **Note:** If you have existing `CLAUDE.md`, `GEMINI.md`, or
> `.github/copilot-instructions.md` files, `dotai init` automatically detects them
> and imports their content into `.ai/AI.md` — nothing is lost.

### Initialize with defaults (selects all tools)
```bash
dotai init --yes
```

### Restore from `.dotai.json` after cloning
```bash
# If .dotai.json exists, dotai init reads it and sets up everything automatically
dotai init
```

### Initialize with specific tools
```bash
dotai init --tools claude,gemini,copilot
```

### Check symlink health
```bash
dotai status
```

### Fix broken symlinks
```bash
dotai doctor --fix
```

### Add a new tool later
```bash
dotai add copilot
```

### Force re-link (backs up and replaces existing files)
```bash
dotai link --force --backup
```

### Remove a tool
```bash
dotai remove gemini
```

## The `.ai/AI.md` File

This is the heart of dotai. Write your project context once:

```markdown
# AI Instructions — MyProject

## Architecture
- src/api/       — REST API routes (Express.js)
- src/services/  — Business logic layer
- src/models/    — Database models (Prisma)

## Tech Stack
- TypeScript 5.x, Node.js 20, PostgreSQL 16

## Key Commands
| Action | Command |
|--------|---------|
| Dev    | `npm run dev` |
| Test   | `npm test`    |
| Build  | `npm run build` |

## Important Constraints
- NEVER use `any` type
- ALWAYS run tests before committing
```

Every AI tool sees this content through its own native config path.

## Platform Support

| Platform | Symlink Type | Notes |
|---|---|---|
| macOS / Linux | Standard symlinks | Works out of the box |
| Windows 10+ | NTFS junctions (dirs) + symlinks (files) | No admin privileges needed |

All symlinks use **relative paths** for portability — move or clone the repo anywhere and `dotai link` recreates everything.

## After Cloning

When a teammate clones the repo, they just run:

```bash
npm install -g @nbslabs/dotai  # if not already installed
dotai init            # reads .dotai.json, scaffolds missing files, links everything
```

`dotai init` detects the existing `.dotai.json` and automatically sets up the project — no prompts, no tool selection. Just like `npm install` reads `package.json`.

## Git Integration

- ✅ **Commit** the `.ai/` directory — it is your source of truth
- ✅ **Commit** `.dotai.json` — it tracks which tools are configured
- ❌ **Don't commit** `.claude/`, `.gemini/`, etc. — dotai adds them to `.gitignore` automatically

## Development

```bash
git clone https://github.com/nbslabs/dotai-cli.git
cd dotai-cli
npm install
npm run dev     # Watch mode (rebuilds on save)
npm test        # Run test suite (Vitest)
npm run build   # Production build
npm run lint    # TypeScript type check
```

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-thing`)
3. Commit your changes (`git commit -m 'Add amazing thing'`)
4. Push to the branch (`git push origin feature/amazing-thing`)
5. Open a Pull Request

## License

[MIT](LICENSE)
