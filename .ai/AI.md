# AI Instructions — dotai

> This file is your single source of truth for all AI coding tools.
> It is symlinked to CLAUDE.md, GEMINI.md, AGENTS.md, and more by dotai.
> Edit this file — all tools stay in sync automatically.

---

## ⚡ Before You Start — Read the Knowledge Base

**IMPORTANT**: Before exploring the codebase or asking the user questions, read the
knowledge base files in `.ai/knowledge/`. They contain pre-scanned codebase context
that saves you from re-discovering what previous sessions already learned.

1. **Start with** `.ai/knowledge/INDEX.md` — module map, exports, and dependency graph
2. **Check** `.ai/knowledge/gotchas.md` — known edge cases and "never do X" rules
3. **Check** `.ai/knowledge/patterns.md` — recurring code patterns in this project
4. **Check** `.ai/knowledge/changelog.md` — recent code changes
5. **For deep context on a specific module**, read `.ai/knowledge/modules/<name>.md`

If the knowledge base does not exist yet, suggest the user runs:
```bash
dotai knowledge scan
```

## 🧠 Auto-Persist Rule (MANDATORY)

**YOU MUST FOLLOW THIS RULE AT ALL TIMES**:

Whenever you read, analyze, or modify code and discover something that is NOT already
in the knowledge base — **immediately persist it** by calling the `knowledge_append`
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
1. **MCP tool** — call `knowledge_append` directly (no user interaction needed)
2. **Shell command** — run `dotai knowledge append --gotchas --finding "..." --agent "your-name"`

### What NOT to persist:
- Information already in the knowledge base (check first)
- Trivially obvious things readable from the code itself
- Task-specific context that won't help future sessions

### Persist format:
- Be specific: include file names, function names, line references
- Explain WHY, not just WHAT
- Keep each finding under 3 sentences
- Use `target: "gotchas"` for edge cases, bugs, constraints
- Use `target: "patterns"` for recurring code patterns
- Use `module: "<name>"` for module-specific discoveries

## 📋 MCP Server Reference

If the dotai knowledge MCP server is configured, you have access to these tools:

| Tool | Description |
|------|-------------|
| `knowledge_query` | Search knowledge base by keyword |
| `knowledge_get_module` | Get full summary of a specific module |
| `knowledge_list_modules` | List all indexed modules |
| `knowledge_recent_changes` | Get recent codebase changes |
| `knowledge_append` | **Write back** a finding to persist across sessions |
| `knowledge_explore` | Read source files for deep analysis |
| `knowledge_populate_ai_md` | Update AI.md project sections with codebase-specific info |

---

## Project Overview

`@nbslabs/dotai` is a CLI tool that manages AI coding tool configurations from a single
`.ai/` directory. It creates symlinks so that one set of instructions, rules, commands,
and knowledge files are shared across Claude Code, Gemini CLI, Cursor, GitHub Copilot,
Windsurf, Codex, and Antigravity.

**v2.0** adds a persistent knowledge layer at `.ai/knowledge/` — a codebase scanner,
file watcher, git hooks, and an MCP server that gives agents persistent memory across sessions.

## Architecture

- `src/commands/` — Yargs command modules
  - `init.ts` — Interactive/bootstrap project initialization
  - `link.ts` / `unlink.ts` — Symlink creation and removal
  - `status.ts` — Symlink health reporting
  - `add.ts` / `remove.ts` — Tool management
  - `list.ts` / `sync.ts` / `doctor.ts` — Diagnostics
  - `knowledge.ts` — 8 knowledge subcommands (scan, update, watch, serve, hook, status, append, clean)
- `src/core/` — Core business logic
  - `config.ts` — `.dotai.json` read/write/defaults, `KnowledgeConfig`
  - `registry.ts` — Tool definitions, link mappings, gitignore entries for 7 tools
  - `scaffold.ts` — Template engine for `.ai/` directory (all templates inlined)
  - `symlink.ts` — Cross-platform symlink engine (Unix symlinks, Windows junctions)
  - `platform.ts` — OS detection and platform-specific symlink behavior
- `src/core/knowledge/` — Knowledge system
  - `scanner.ts` — Regex-based AST scanner (TS/JS, Java, Python, Go)
  - `renderer.ts` — Markdown renderer with merge logic for preserving manual edits
  - `watcher.ts` — Chokidar file watcher with 1500ms debounce
  - `mcp.ts` — JSON-RPC 2.0 stdio MCP server (7 tools)
  - `git.ts` — Git helpers (commit hash, changed files, post-commit hook)
  - `types.ts` — Shared types (ModuleInfo, FileInfo, ScanResult, KnowledgeConfig)
- `src/utils/` — Shared utilities
  - `logger.ts` — Colored terminal output (all output routes through here)
  - `fs.ts` — `fs/promises` wrappers (ensureDir, pathExists, writeTextFile, readTextFile)
  - `prompt.ts` — Inquirer prompt wrappers
- `src/version.ts` — Build-time injected version constant
- `src/index.ts` — CLI entrypoint (yargs setup)

## Tech Stack

- Language: TypeScript 5.x (strict mode)
- Runtime: Node.js >= 18
- Build: tsup (CJS output, single bundle `dist/index.js`)
- CLI Framework: yargs 17.x
- Testing: Vitest 3.x
- Terminal Colors: picocolors
- Interactive Prompts: @inquirer/prompts
- File Watching: chokidar 4.x
- Gitignore Parsing: ignore 7.x

## Coding Conventions

- Use `fs/promises` for ALL file operations — never use sync fs methods
- Route ALL terminal output through `src/utils/logger.ts` — never use `console.log`
- Use relative symlinks for portability — paths must work after repo clone
- Handle Windows NTFS junctions vs Unix symlinks in `platform.ts`
- Template content is inlined in `scaffold.ts` — no separate template files
- All knowledge commands require `dotai init` first (`requireInit()` guard)
- MCP server uses JSON-RPC 2.0 over stdio — no HTTP
- The scanner uses regex-based heuristics, NOT native AST parsers
- Escape backticks carefully in template strings (triple `\\\``)

## Key Commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev (watch) | `npm run dev` |
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Local CLI test | `node dist/index.js <command>` |

## Important Constraints

- NEVER use `any` type in TypeScript
- NEVER use `console.log` in MCP serve path — stdout is reserved for JSON-RPC
- NEVER use sync file system calls — always use `fs/promises`
- NEVER delete non-symlink files without `--force` and user confirmation
- NEVER import from `dist/` — always import from `src/`
- NEVER use Unicode characters in MCP server output (tool responses, errors) — ASCII only
- NEVER send JSON-RPC responses for notification methods (methods starting with `notifications/`)
- ALWAYS run `npm test` and `npm run lint` before finalizing changes
- ALWAYS use relative symlink paths — absolute paths break on clone
- ALWAYS guard knowledge commands (except `serve`) with `requireInit()` check
- ALWAYS use `process.stderr.write()` for MCP serve diagnostics, never `logger.*`
- Template strings with markdown must triple-escape backticks
- The `ignore` package's `ignores()` checks file paths AND directory paths (with trailing slash)

## Common Pitfalls

- **Backtick escaping in scaffold.ts**: Template strings containing markdown code blocks
  need triple-escaped backticks. Missing escapes cause build failures.
- **chokidar types**: Import `FSWatcher` type explicitly from `chokidar` — namespace
  resolution fails without it.
- **ignore glob patterns**: The `shouldSkip` method must check both `path` and `path/`
  (with trailing slash) to correctly match directory-level globs like `dir/**`.
- **MCP stdout is sacred**: The MCP `serve` command must NEVER use `logger.*` — logger
  uses `console.log` which writes to stdout, corrupting the JSON-RPC stream. Use
  `process.stderr.write()` for all diagnostics. Unicode characters (checkmarks, em-dashes)
  in stdout cause `invalid character 'â'` errors in MCP clients.
- **MCP notifications**: JSON-RPC notifications (like `notifications/initialized`) have
  no `id` and must NOT receive a response. Sending `{"id":null}` breaks the next request.
- **MCP serve is independent**: The `serve` command does not require `.dotai.json`.
  It uses defaults (`.ai/` for aiDir) and auto-creates the knowledge directory.
- **MCP --project flag**: IDE-spawned MCP processes need `--project /path` because
  their cwd is often the user's home directory, not the workspace.
- **knowledge_append auto-creates**: If gotchas.md, patterns.md, or a module file
  doesn't exist, `knowledge_append` creates it with proper headers automatically.
- **Windows junctions**: Directory symlinks on Windows use NTFS junctions (no admin
  privileges needed). File symlinks use regular symlinks.
- **Version injection**: Version comes from `src/version.ts` which is injected at build
  time via tsup's `define` option. Don't hardcode version strings.
