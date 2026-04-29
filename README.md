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

## What's New in v3.1.0 — Resource Management Commands

Manage **every aspect** of your AI tool configuration from the CLI — MCP servers, skills, rules, slash commands, and config settings.

```bash
dotai mcp add my-server -c npx -a "my-pkg,serve,--stdio"   # add MCP server
dotai skill add code-review -d "Code review guidelines"    # add skill
dotai rule add api-conventions --always                     # add rule
dotai cmd add deploy                                        # add slash command
dotai config show                                           # view config
```

All commands auto-sync across every enabled tool — Claude, Gemini, Antigravity, and Copilot.

### Also includes
- **Spec-Driven Development (SDD)** — 8-phase workflow for spec-traced code generation
- **AI-Driven Knowledge Base** — `dotai knowledge init` scaffolds the KB + `/learn` command; agents populate it
- **Built-in `/git-stage-commit`** — Stage, generate commit message, and commit locally (no push)
- **4 AI Tools** — Gemini CLI, Antigravity, Claude Code, GitHub Copilot

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
├── rules/              ──→    .claude/rules/, .gemini/rules/,
│                               .agents/rules/
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

### Core Commands

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
| `dotai upgrade` | Update `.ai/` scaffold files to latest templates |

### Resource Management (v3.1.0)

| Command | Description |
|---|---|
| `dotai mcp add <name>` | Add an MCP server to all enabled tool settings |
| `dotai mcp remove <name>` | Remove an MCP server from all settings files |
| `dotai mcp list` | List all configured MCP servers across tools |
| `dotai skill add <name>` | Create a skill package with SKILL.md template |
| `dotai skill remove <name>` | Delete a skill package |
| `dotai skill list` | List all skills with descriptions and tool linkage |
| `dotai rule add <name>` | Create a coding rule file with frontmatter |
| `dotai rule remove <name>` | Delete a rule file |
| `dotai rule list` | List all rules with alwaysApply status |
| `dotai cmd add <name>` | Create a slash command across all enabled tool formats |
| `dotai cmd remove <name>` | Remove a command from all formats |
| `dotai cmd list` | List all commands merged across tool formats |
| `dotai config get <key>` | Read a config value from `.dotai.json` |
| `dotai config set <key> <value>` | Set a config value |
| `dotai config show` | Display full configuration |

### SDD (Spec-Driven Development)

| Command | Description |
|---|---|
| `dotai sdd init` | Scaffold SDD toolkit (skills, commands, templates) |
| `dotai sdd new <name>` | Create a new feature directory from template |
| `dotai sdd remove <name>` | Remove a feature and all its artifacts |
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

`dotai knowledge` creates a persistent codebase memory layer at `.ai/knowledge/` and equips your AI agents with the skills and commands to populate it.

### Quick Start

```bash
dotai knowledge init   # scaffold knowledge dir + install /learn command
```

Then ask your AI agent:

```
/learn
```

The `/learn` command instructs the agent to deeply analyze your codebase and persist findings (architecture, patterns, gotchas) into `.ai/knowledge/`.

### How It Works

1. **`dotai knowledge init`** creates:
   - `knowledge/` directory with skeleton files (INDEX.md, patterns.md, gotchas.md, changelog.md)
   - `skills/knowledge-scan-skill/SKILL.md` — instructs agents how to perform deep analysis
   - `/learn` slash command for each enabled tool (Claude, Gemini, Antigravity, Copilot)

2. **Your AI agent does the rest** — using MCP tools (`knowledge_explore`, `knowledge_append`, `knowledge_populate_ai_md`) or by reading the skill directly. The agent understands semantics — it identifies patterns, gotchas, and architectural decisions that no static scanner can.

> **Why AI-driven?** CLI scanners extract exports and file structure, but they miss *context* — why something is designed a certain way, what not to do, hidden dependencies. AI agents understand semantics and produce dramatically better knowledge.

### Knowledge Commands

| Command | Description |
|---|---|
| `dotai knowledge init` | Scaffold knowledge directory + /learn command + scan skill |
| `dotai knowledge serve` | MCP stdio server (runs independently, no init required) |
| `dotai knowledge status` | Show knowledge base health |
| `dotai knowledge clean` | Delete knowledge base for fresh start |

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
dotai knowledge init              # 2. scaffold knowledge + /learn command
# 3. Ask your agent: /learn
```

**Daily workflow:**
```
Code normally → Open AI agent → reads knowledge → starts smart
→ discovers more → auto-persists via knowledge_append
```

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

### Running Phase Commands

The argument to every phase command is the **feature name** — not an individual file:

```bash
# Claude / Gemini CLI:
/sdd-implement user-authentication

# If you omit the name, the agent lists features and asks:
/sdd-implement
```

**How each phase processes work:**

| Phase | Scope | Behavior |
|-------|-------|----------|
| Specify | Entire feature | Reads `idea.md`, produces one `requirements.md` |
| Decompose | Entire feature | Reads `requirements.md`, produces **all** task files at once |
| Plan | Entire feature | Generates plans **and** evaluation criteria for **all** tasks in one shot |
| Implement | **One task** | Implements the lowest-indexed incomplete task, then **stops and waits** |
| Evaluate | **One task** | Evaluates the most recently implemented task — PASS → next, FAIL → retry |
| Review | Entire feature | Holistic review of the **complete** implementation |
| Sync | Entire feature | Updates knowledge base with all decisions and patterns |

> **Implement and Evaluate are sequential by design.** The agent works on one task at
> a time so you can inspect progress between tasks. Run `/sdd-implement` again to
> advance to the next task. If evaluation fails, the agent retries the same task
> automatically before moving on.



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

## Resource Management

`dotai` v3.1.0 introduces CLI commands to manage all `.ai/` resources without manually editing files.

### MCP Servers

Add, remove, and list MCP server configurations across all enabled tool settings files.

```bash
# Add an MCP server to all tools
dotai mcp add my-server -c npx -a "@my-org/server,serve,--stdio"

# Add with environment variables
dotai mcp add db-server -c npx -a "db-mcp,--stdio" -e "DB_URL=postgres://localhost:5432/mydb"

# Add to only Claude
dotai mcp add claude-only-server -c npx -a "my-pkg" --tool claude

# List all configured servers
dotai mcp list

# Remove a server
dotai mcp remove my-server
```

### Skills

Create and manage reusable skill packages in `.ai/skills/`.

```bash
dotai skill add code-review -d "Code review checklist"
dotai skill list
dotai skill remove code-review
```

### Rules

Manage coding rule files in `.ai/rules/` with YAML frontmatter.

```bash
dotai rule add api-conventions --always    # always apply
dotai rule add testing-guidelines          # on-demand
dotai rule list
```

### Slash Commands

Create cross-tool slash commands. `dotai cmd add` creates format-appropriate files for every enabled tool:

| Tool | Directory | Format |
|---|---|---|
| Claude Code | `commands/` | `.md` |
| Gemini CLI | `commands-gemini/` | `.toml` |
| Antigravity | `workflows/` | `.md` |
| Copilot | `prompts/` | `.prompt.md` |

```bash
dotai cmd add deploy         # creates files for all enabled tools
dotai cmd list               # shows commands merged across formats
dotai cmd remove deploy      # removes from all formats
```

### Built-in Slash Commands

`dotai init` automatically creates these slash commands for all enabled tools:

| Command | Description |
|---|---|
| `/review` | Review code changes and provide feedback |
| `/deploy` | Guide through the deployment process |
| `/learn` | Deep codebase scan — populate `.ai/knowledge/` |
| `/git-stage-commit` | Stage all changes, generate commit message, commit locally (no push) |

`/git-stage-commit` also checks whether the knowledge base has been populated — if `.ai/knowledge/` exists but is empty, it runs the `/learn` flow first.

### Config

View and modify `.dotai.json` settings directly.

```bash
dotai config show            # dump full config
dotai config get tools       # get a specific key
dotai config set aiDir .ai   # set a value (restricted keys)
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

### Upgrade scaffold files to latest version
```bash
dotai upgrade              # smart update — new files, stale cleanup, manual review
dotai upgrade --dry-run    # preview without changes
dotai upgrade --force      # overwrite ALL files (destructive)
```

`upgrade` creates new template files, auto-updates reference docs, removes obsolete files from previous versions, and saves user-modified files to `_upgrade/` for manual review.

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
