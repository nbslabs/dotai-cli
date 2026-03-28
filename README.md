<p align="center">
  <h1 align="center">dotai</h1>
  <p align="center"><strong>One <code>.ai/</code> folder. All your AI tools. Always in sync.</strong></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dotai"><img src="https://img.shields.io/npm/v/dotai.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dotai"><img src="https://img.shields.io/npm/dm/dotai.svg" alt="npm downloads"></a>
  <a href="https://github.com/nbslabs/dotai-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="node version"></a>
</p>

---

AI coding tools each expect their own config directory — `.claude/`, `.gemini/`, `.cursor/`, `.github/`, `.windsurf/`, `.codex/`, `.agents/`. **dotai** creates a single `.ai/` directory as your source of truth and symlinks everything to where each tool expects it.

Edit one file. Every tool stays in sync.

## Why dotai?

Without dotai, you juggle:

```
CLAUDE.md            ← Claude Code reads this
GEMINI.md            ← Gemini CLI reads this
AGENTS.md            ← Windsurf & Codex read this
.github/copilot-instructions.md  ← Copilot reads this
.cursor/rules/       ← Cursor reads this
.windsurf/rules/     ← Windsurf reads this
.gemini/rules/       ← Antigravity reads this
```

With dotai:

```
.ai/AI.md  →  symlinked to all of the above
```

One file to write. Seven tools that read it. Zero drift.

## Quick Start

```bash
# Install globally
npm install -g dotai

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
├── rules/              ──→    .cursor/rules/, .windsurf/rules/, .gemini/rules/
├── commands/           ──→    .claude/commands/, .gemini/commands/
├── skills/             ──→    .claude/skills/, .agents/skills/, .codex/skills/
├── workflows/          ──→    .agents/workflows/
├── settings/
│   ├── claude.json     ──→    .claude/settings.json
│   └── gemini.json     ──→    .gemini/settings.json
└── ignore/
    ├── .aiignore       ──→    .geminiignore
    └── .codeiumignore  ──→    .codeiumignore
```

## Commands

| Command | Description |
|---|---|
| `dotai init` | Scaffold `.ai/` directory and create `.dotai.json` config |
| `dotai link [tools...]` | Create symlinks for specified or all configured tools |
| `dotai unlink [tools...]` | Remove symlinks, optionally restore backed-up originals |
| `dotai status` | Show the current state of every symlink |
| `dotai add <tool>` | Add a new tool to an existing project |
| `dotai remove <tool>` | Remove a tool and clean up its symlinks |
| `dotai list` | List all supported tools and their link status |
| `dotai sync` | Re-evaluate and repair all symlinks |
| `dotai doctor` | Run diagnostics and auto-fix issues |

## Supported Tools

| ID | Tool | Native Dir | What Gets Symlinked |
|---|---|---|---|
| `claude` | Claude Code | `.claude/` | AI.md → CLAUDE.md, settings, commands, skills |
| `gemini` | Gemini CLI | `.gemini/` | AI.md → GEMINI.md, settings, commands, ignore |
| `cursor` | Cursor | `.cursor/` | rules |
| `copilot` | GitHub Copilot | `.github/` | AI.md → copilot-instructions.md, prompts, instructions |
| `windsurf` | Windsurf | `.windsurf/` | AI.md → AGENTS.md, rules, ignore |
| `codex` | OpenAI Codex CLI | `.codex/` | AI.md → AGENTS.md, global skills |
| `antigravity` | Antigravity | `.gemini/` | AI.md → GEMINI.md, settings, rules, workflows, skills |

## Usage

### Initialize with defaults (selects all tools except Codex)
```bash
dotai init --yes
```

### Pick specific tools interactively
```bash
dotai init
```

### Initialize with specific tools
```bash
dotai init --tools claude,gemini,cursor
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
dotai remove windsurf
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
npm install -g dotai  # if not already installed
dotai link            # recreates all symlinks from .ai/
```

## Git Integration

- ✅ **Commit** the `.ai/` directory — it is your source of truth
- ✅ **Commit** `.dotai.json` — it tracks which tools are configured
- ❌ **Don't commit** `.claude/`, `.gemini/`, `.cursor/`, etc. — dotai adds them to `.gitignore` automatically

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
