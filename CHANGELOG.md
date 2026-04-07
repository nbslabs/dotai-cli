# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-04-08

### Added
- **`knowledge_append` MCP tool**: Agents can now write findings directly to the
  knowledge base via MCP, without needing shell commands. Supports `target` (gotchas/
  patterns), `module` (module-specific), `finding`, and `agent` parameters.
- **`knowledge_explore` MCP tool**: Agents can read source files from the project for
  deep analysis. Returns file contents for agent-driven knowledge extraction, with
  configurable path, extensions, and max file count.
- **`knowledge_populate_ai_md` MCP tool**: Agents can update project-specific sections
  of AI.md (Architecture, Tech Stack, Key Commands, etc.) while preserving all dotai
  instruction sections (auto-persist rule, MCP reference, knowledge base instructions).
- **Existing instruction file detection**: `dotai init` now detects existing
  `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, and `.github/copilot-instructions.md` files
  and automatically merges their content into `.ai/AI.md` during initialization.
  Users' existing instructions are preserved under an "Imported Instructions" section.

### Changed
- **AI.md template — mandatory auto-persist rule**: The "Persist What You Learn"
  section has been replaced with a stronger "Auto-Persist Rule (MANDATORY)" section
  that instructs agents to IMMEDIATELY call `knowledge_append` whenever they discover
  something non-obvious, without waiting for user prompts. Persistence happens as a
  side-effect of work, not as a separate step.
- **AI.md template — MCP reference table**: Now includes all 7 MCP tools
  (`knowledge_query`, `knowledge_get_module`, `knowledge_list_modules`,
  `knowledge_recent_changes`, `knowledge_append`, `knowledge_explore`,
  `knowledge_populate_ai_md`).
- **`/learn` command template**: Updated to reference MCP `knowledge_append` tool as
  preferred method (Method 1) with CLI fallback (Method 2).
- **`knowledge_explore` response**: Includes an "AUTO-PERSIST REQUIRED" directive
  telling agents to immediately persist each finding.
- **`dotai knowledge` requires init**: All 8 knowledge subcommands now check for
  `.dotai.json` and error with "Run `dotai init` first" if dotai has not been
  initialized.
- **MCP server constructor**: Now accepts `projectRoot` and `aiDir` parameters for
  the new `knowledge_explore` and `knowledge_populate_ai_md` tools.
- **MCP config uses `npx` instead of bare `dotai`**: Settings templates
  (`claude.json`, `gemini.json`) and all doc examples now use
  `"command": "npx", "args": ["dotai", ...]` instead of
  `"command": "dotai"`. This fixes `ENOENT` errors when Node is installed via
  nvm, since IDE-spawned MCP processes don't inherit `.bashrc` PATH.
- **Settings templates include MCP out-of-box**: `claude.json` and `gemini.json`
  now ship with the `dotai-knowledge` MCP server pre-configured — no manual
  setup needed after `dotai init`.
- **MCP serve runs independently**: `dotai knowledge serve` no longer requires
  `.dotai.json` or a pre-existing knowledge directory. It uses sensible defaults
  (`.ai/` for aiDir) and auto-creates the knowledge directory if missing.
- **`--project` flag for serve**: New `--project /path/to/project` option lets
  IDE-spawned MCP processes (Antigravity, Cursor) specify the project root
  explicitly, since their cwd may not be the workspace.
- **`knowledge_append` auto-creates files**: If the target knowledge file
  (gotchas.md, patterns.md, or a module file) doesn't exist, it is automatically
  created with proper markdown headers instead of returning an error.

### Fixed
- **MCP `initialize` error (`invalid character 'â'`)**: All Unicode characters
  (checkmarks, em-dashes, arrows) removed from MCP tool responses and the serve
  command's error handling now uses `process.stderr.write()` instead of
  `logger.error()` (which wrote Unicode symbols to stdout via `console.log`,
  corrupting the JSON-RPC stream).
- **MCP `tools/list` error (`invalid request`)**: The server was incorrectly
  sending a response for `notifications/initialized` (a JSON-RPC notification).
  Notifications must never receive a response. The stray `{"id":null}` response
  was consumed by the client as the `tools/list` reply, causing a parse failure.
- **Git hook infinite changelog loop**: The post-commit hook was appending to
  `changelog.md` infinitely because: (1) `.ai/knowledge/` files were included
  in the changed-files diff triggering their own re-scan, and (2) the amend
  re-triggered the post-commit hook. Fixed with three layers: knowledge files
  are filtered from changed-files, changelog deduplicates by commit message,
  and a `.git/dotai-hook.lock` file prevents re-entrancy.
- **Git hook commit hash mismatch**: The hook recorded the pre-amend commit
  hash in knowledge files, which became stale after amend. Hook-triggered
  updates now use `hook` as the hash label instead of the (about-to-change)
  real hash.

### Changed (Git Hook)
- **Hook v3 with auto-amend**: The post-commit hook now stages `.ai/knowledge/`
  changes and amends them into the current commit (`--no-edit` preserves the
  message). This eliminates the dirty-diff problem where knowledge changes
  would pile up as unstaged changes after every commit.
- **Hook version detection**: `install`, `uninstall`, and `status` now recognize
  all dotai hook versions (v2 and v3), enabling seamless upgrades.

### Changed (Scan Output)
- **`dotai knowledge scan` next-step prompt**: After scanning, the CLI now
  prints a "Next step" message with an example prompt for agents to deeply
  populate the knowledge base using MCP tools.

### Added
- **`dotai knowledge` — Persistent Agent Memory Layer**: New command family that scans
  your codebase and builds a persistent knowledge base at `.ai/knowledge/`. Survives
  across conversations so agents never start from scratch.
- **`dotai knowledge scan`**: Full codebase scanner using regex-based AST heuristics.
  Supports TypeScript, JavaScript, Java, Python, Go. Generates per-module markdown
  summaries with exports, imports, dependencies, and dependency graph.
- **`dotai knowledge update`**: Incremental update from git diff — only re-scans
  changed files. Updates `changelog.md` automatically.
- **`dotai knowledge watch`**: File watcher (chokidar) that triggers incremental
  updates on save. 1500ms debounce for batch saves.
- **`dotai knowledge serve`**: MCP stdio server exposing `knowledge_query`,
  `knowledge_get_module`, `knowledge_recent_changes`, and `knowledge_list_modules`
  tools to MCP-compatible clients (Claude Code, Gemini CLI).
- **`dotai knowledge hook`**: Installs/uninstalls a git `post-commit` hook that
  automatically runs `dotai knowledge update` after every commit.
- **`dotai knowledge status`**: Shows knowledge base health, last scan time, module
  count, and staleness warnings.
- **`dotai knowledge append`**: Appends agent or human findings to `gotchas.md`,
  `patterns.md`, or a specific module file with timestamp + attribution.
- **`dotai knowledge clean`**: Deletes the knowledge base for a fresh re-scan.
- **`/learn` command** (`commands/learn.md`): New Claude/Gemini slash command template
  instructing agents on how to write findings back to the knowledge base.
- **Knowledge symlinks** in registry: `knowledge/` directory is now symlinked into
  `.claude/knowledge/`, `.gemini/knowledge/`, and `.github/knowledge/` for Claude,
  Gemini, and Copilot respectively.
- **`KnowledgeConfig`** in `.dotai.json`: New optional `knowledge` config block with
  `enabled`, `scanDepth`, `excludePatterns`, `autoUpdateOnCommit`, `mcpPort` fields.
- **Updated `DOTAI.md` template**: Now includes full knowledge base documentation,
  MCP setup instructions, and agent integration guide.

### Changed
- `DotAiConfig` interface extended with optional `knowledge?: KnowledgeConfig` field.
  Fully backward-compatible — existing `.dotai.json` files work without changes.
- `scaffoldAiDir` now creates `knowledge/` skeleton structure (INDEX.md, patterns.md,
  gotchas.md, changelog.md, modules/, decisions/) on `dotai init`.
- `DOTAI.md` template fully updated for v2 with knowledge base section.
- README tagline updated: "Always in sync. **Always in context.**"
- Package description updated to reflect knowledge layer.

### Breaking Changes
- **None.** All existing commands, config files, and symlinks continue to work without
  modification. The `knowledge` block in `.dotai.json` is optional and defaults to
  disabled.

## [1.1.0] - 2026-04-01

### Added
- **`dotai init` now bootstraps from existing `.dotai.json`** — when `.dotai.json` is present, `dotai init` reads it and automatically scaffolds missing files + creates all symlinks without prompts, similar to how `npm install` works with `package.json`
- After cloning a dotai-managed repo, teammates just run `dotai init` — no need to pick tools or configure anything

### Changed
- `dotai init` with `--tools` flag while `.dotai.json` exists triggers a reinit flow (updates config with new tools)

## [1.0.2] - 2026-03-28

### Fixed
- Version was hardcoded as `1.0.0` in `dotai init` banner, `.dotai.json`, and `--version` output instead of reading from `package.json`
- Version is now injected at build time via `tsup define` and shared through `src/version.ts`

## [1.0.1] - 2026-03-28

### Added
- **Antigravity** as 7th supported tool (settings, rules, workflows, skills)
- Improved `AI.md` template with best practices to reduce AI hallucination
- `DOTAI.md` auto-generated guide explaining the `.ai/` directory and symlink mappings
- `docs/` single-page documentation website for GitHub Pages
- Consolidated `AI.md` as single source (replaces separate CLAUDE.md, GEMINI.md, AGENTS.md templates)

### Changed
- Package scoped to `@nbslabs/dotai`
- `gemini.json` settings now shared between Gemini CLI and Antigravity

## [1.0.0] - 2026-03-28

### Added
- Initial release of `dotai` CLI
- **9 commands**: `init`, `link`, `unlink`, `status`, `add`, `remove`, `list`, `sync`, `doctor`
- **6 supported AI tools**: Claude Code, Gemini CLI, Cursor, GitHub Copilot, Windsurf, OpenAI Codex CLI
- Symlink engine with relative paths for portability
- Platform support for macOS, Linux, and Windows (NTFS junctions)
- Template scaffolding for `.ai/` directory structure
- Automatic `.gitignore` management
- Backup and restore for existing config files
- Dry-run mode for all destructive operations
- JSON output mode for `status`, `list`, and `doctor` commands
- Interactive prompts for tool selection and project setup
