# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-04-30

### Added
- **`dotai mcp` command group** — Manage MCP server configurations across all
  enabled tools from the CLI.
  - `dotai mcp add <name> -c <cmd> [-a <args>] [-e <env>]` — Add an MCP server
    to all enabled tool settings files (`.ai/settings/claude.json`,
    `.ai/settings/gemini.json`). Supports `--tool` to target a single tool,
    `--url` for HTTP-based servers, and `--env` for environment variables.
  - `dotai mcp remove <name>` — Remove an MCP server from all settings files.
  - `dotai mcp list [--json]` — List all configured MCP servers with their
    command, args, and which settings files reference them.
  - Correctly deduplicates Gemini/Antigravity which share `settings/gemini.json`.
    Auto-creates settings files if missing.

- **`dotai skill` command group** — Manage reusable skill packages in
  `.ai/skills/`.
  - `dotai skill add <name> [-d "description"]` — Create a skill directory with
    a `SKILL.md` template. Validates kebab-case naming and auto-refreshes
    symlinks for all enabled tools.
  - `dotai skill remove <name> [-y]` — Delete a skill package with confirmation.
  - `dotai skill list [--json]` — List all skills with descriptions parsed from
    SKILL.md frontmatter, showing which tools they're linked to.

- **`dotai rule` command group** — Manage coding rule files in `.ai/rules/`.
  - `dotai rule add <name> [--always]` — Create a rule file with proper YAML
    frontmatter (`description`, `alwaysApply`).
  - `dotai rule remove <name> [-y]` — Delete a rule file with confirmation.
  - `dotai rule list [--json]` — List all rules showing `[always]` vs
    `[on-demand]` badges and descriptions.

- **`dotai cmd` command group** — Manage custom slash commands across all
  enabled tool formats simultaneously.
  - `dotai cmd add <name>` — Creates command files for every enabled tool in
    one shot: `commands/<name>.md` (Claude), `commands-gemini/<name>.toml`
    (Gemini), `workflows/<name>.md` (Antigravity), `prompts/<name>.prompt.md`
    (Copilot). Uses a data-driven `CMD_TARGETS` architecture so new tools only
    need one entry.
  - `dotai cmd remove <name> [-y]` — Removes the command from all formats
    (including formats for tools that are no longer enabled).
  - `dotai cmd list [--json]` — Lists all commands merged by base name across
    all 4 format directories.

- **`dotai config` command group** — View and modify `.dotai.json` settings
  directly from the CLI.
  - `dotai config get <key>` — Read any config key (supports nested objects,
    outputs JSON for complex values).
  - `dotai config set <key> <value>` — Set a config value (restricted to safe
    keys: `aiDir`, `gitignore`). Auto-parses booleans and numbers.
  - `dotai config show` — Dump the full `.dotai.json` configuration as
    formatted JSON.

### Changed
- **`dotai cmd add` is now data-driven** — Previously only created `.md` (Claude)
  and `.toml` (Gemini) files. Now uses a `CMD_TARGETS` array that maps all 4
  tool command formats. Adding support for a new tool requires only one entry.
- **`dotai sdd remove <name>` command** — Remove an SDD feature and all its
  artifacts from `.ai/sdd/`. Shows feature phase, file count, and requires
  confirmation before deletion. Supports `-y` for scripted usage.
- **`dotai knowledge` simplified to AI-driven model** — Removed `scan`, `update`,
  `watch`, `hook`, and `append` subcommands. Replaced with `knowledge init` which
  scaffolds the knowledge directory, installs a `knowledge-scan-skill`, and creates
  `/learn` slash commands for all enabled tools. Knowledge generation is now fully
  delegated to AI agents via MCP tools.
- **Built-in `/git-stage-commit` slash command** — `dotai init` now scaffolds a
  `/git-stage-commit` command for all tools (Claude, Gemini, Antigravity, Copilot).
  It stages all changes, generates a conventional commit message from the diff,
  checks whether the knowledge base needs populating, and commits locally without
  pushing.
- **`dotai upgrade` now removes stale files** — The upgrade command detects files
  from previous scaffold versions that are no longer part of the current template
  set and removes them automatically. New files are created, reference docs are
  auto-updated, and user-modified files are staged for manual review.
- **Total CLI commands: 17 top-level** — up from 12 in v3.0.x, with 16 new
  subcommands across the 5 new command groups plus SDD remove.

### Breaking Changes
- **`dotai knowledge scan/update/watch/hook/append` removed.** Use `dotai knowledge init`
  to scaffold the knowledge base, then use `/learn` or the MCP tools to populate it.
  The `serve`, `status`, and `clean` subcommands remain unchanged.

## [3.0.1] - 2026-04-20

### Fixed
- **`dotai remove --purge`** — Added missing `antigravity` tool to the purge file map.
  Removed stale symlink-target entries (`CLAUDE.md`, `GEMINI.md`) that reference
  project-root files instead of `.ai/` source files.
- **Symlink directory detection** — The heuristic that infers file-vs-directory from
  the path now checks only the filename (last segment) instead of the full path, which
  previously false-matched on `.ai/` parent directories containing a dot.
- **`findProjectRoot`** — Replaced `join(dir, '..')` with `resolve(dir, '..')` for
  reliable parent path comparison when walking up the directory tree.
- **Scaffold template duplication** — `scaffoldAiDir()` now delegates to the shared
  `getScaffoldTemplateFiles()` function instead of maintaining a duplicate file list.
- **Redundant imports** — Removed unused `readFile` import from `scaffold.ts` and
  replaced dynamic `readFile` imports in `doctor.ts` and `scaffold.ts` with the
  already-imported `readTextFile` utility.
- **Docs: light-mode diagram contrast** — Applied theme-aware CSS classes to SVG text
  in both `docs/index.html` and `docs/docs.html` diagrams (SDD workflow + knowledge
  loop). Text now uses `var(--text)` and `var(--text-secondary)` instead of hardcoded
  light colors invisible in light mode.

### Enhanced
- **`dotai doctor --fix`** — Missing SDD skill files are now auto-fixable. Previously
  reported as `fixable: false` requiring manual `dotai sdd init --force`; now doctor
  calls `scaffoldSdd` directly when `--fix` is used.
- **SDD file traceability** — All 8 SDD skill templates now include a "File
  Traceability" clause instructing agents to prepend `<!-- feature: <name> -->` as the
  first line of every generated `.md` file, extending traceability beyond the initial
  `idea.md` and `requirements.md`.

## [3.0.0] - 2026-04-16

### Added
- **Spec-Driven Development (SDD) Toolkit** — A structured, 8-phase workflow where
  AI agents implement features from human-reviewed specifications. Every piece of
  generated code traces back to an approved spec.
- **`dotai sdd init`** — Scaffolds the full SDD toolkit: 8 skill files, SDD README,
  feature template, and 28 cross-tool command files. Supports `--force` to re-write
  skills and commands, and `--dry-run` to preview changes.
- **`dotai sdd new <feature-name>`** — Creates a new feature directory from the
  `_template-feature` template with `idea.md`, `requirements.md`, and subdirectories
  for `tasks/`, `plans/`, and `evaluation/`. Validates kebab-case naming.
- **`dotai sdd list`** — Lists all SDD features with their current workflow phase,
  task counts, and evaluation status.
- **`dotai sdd status [feature-name]`** — Shows detailed phase-by-phase progress
  checklist for a specific feature, or overall SDD toolkit health if no feature is
  specified. Includes skill file health check.
- **8 SDD Skill Files** — Reusable agent instruction sets for each workflow phase:
  `requirement-generation-skill`, `task-decompose-skill`, `plan-generation-skill`,
  `evaluation-generation-skill`, `plan-implementation-skill`, `evaluation-skill`,
  `code-review-skill`, `knowledge-update-skill`. All include a feature name discovery
  clause and the implementation skill includes a retry clause for failed evaluations.
- **28 Cross-tool SDD Command Files** — Phase commands (`sdd-specify`, `sdd-decompose`,
  `sdd-plan`, `sdd-implement`, `sdd-evaluate`, `sdd-review`, `sdd-sync`) generated in
  4 formats:
  - Claude Code commands (`.ai/commands/sdd-*.md`)
  - Gemini CLI commands (`.ai/commands-gemini/sdd-*.toml`)
  - GitHub Copilot prompts (`.ai/prompts/sdd-*.prompt.md`)
  - Antigravity workflows (`.ai/workflows/sdd-*.md`)
- **Evaluation result files** — `.result.md` files in `evaluation/` directory persist
  pass/fail verdicts across sessions.
- **Code review report** — `code-review.md` file in feature directory for holistic
  review output.
- **`SddConfig`** in `.dotai.json` — New optional `sdd?: { enabled, initializedAt }`
  config block. Fully backward-compatible.
- **SDD section in `dotai status`** — Shows SDD initialization state and feature count.
- **SDD health checks in `dotai doctor`** — Verifies skill files, AI.md SDD block,
  and config/directory consistency.
- **`tests/sdd.test.ts`** — 21 test cases covering scaffold creation, idempotency,
  force mode, feature creation, name validation, feature listing, and phase detection.

### Changed
- **`dotai init` no longer creates `example-skill/`** — The example skill template has
  been removed from the scaffold. SDD skill files serve as real-world examples instead.
- `DotAiConfig` interface extended with optional `sdd?: SddConfig` field.

### Breaking Changes
- **None.** All existing commands, config files, and symlinks continue to work without
  modification. The `sdd` block in `.dotai.json` is optional and defaults to disabled.

## [2.1.0] - 2026-04-13

### Removed
- **Cursor** tool support — `.cursor/` directory, rules symlink, and `cursor-rule.mdc` template
- **Windsurf** tool support — `.windsurf/` directory, rules symlink, AGENTS.md symlink, `.codeiumignore` ignore file and template
- **OpenAI Codex CLI** tool support — `.codex/` directory, AGENTS.md symlink, global skills link

### Fixed
- **Gemini CLI commands format**: Commands now use a separate `commands-gemini/` directory with `.toml` files (Gemini CLI requires TOML format, not the `.md` format used by Claude Code)
- **Gemini CLI skills missing**: Added `skills → .gemini/skills` symlink (Gemini CLI supports skills at `.gemini/skills/`)
- **Copilot skills missing**: Added `skills → .github/skills` symlink (GitHub Copilot supports skills at `.github/skills/`)
- **Antigravity AGENTS.md missing**: Added `AI.md → AGENTS.md` symlink for Antigravity (reads both `GEMINI.md` and `AGENTS.md` natively)

### Added
- `commands-gemini/` directory in `.ai/` scaffold with `review.toml` and `deploy.toml` template files
- `AGENTS.md` added to Antigravity's `.gitignore` entries

### Changed
- **4 supported tools**: Gemini CLI, Antigravity, Claude Code, GitHub Copilot (previously 7)
- `dotai init --yes` now selects all 4 tools (previously excluded Codex)
- `getToolChoices()` marks all tools as checked by default (no more Codex exception)
- `EXISTING_INSTRUCTION_FILES` no longer checks for `AGENTS.md` during init
- All skip-directory lists (scanner, MCP explore, watcher) updated to remove `.cursor/`, `.windsurf/`, `.codex/`
- Gemini CLI `commands` link source changed from `commands` (shared with Claude) to `commands-gemini` (separate `.toml` files)
- Skills now symlinked to all 4 tools: Claude (`.claude/skills/`), Gemini CLI (`.gemini/skills/`), Antigravity (`.agents/skills/`), Copilot (`.github/skills/`)
- DOTAI.md template, AI.md references, and all documentation updated for 4-tool focus
- `docs/index.html` updated to reflect new tool set
- README.md, docs/index.html updated to reflect all mapping changes
- Registry, tests, README, and package.json keywords cleaned up

### Upgrade from v2.0.x

> **Existing repos**: After upgrading dotai, run `dotai init` in your project. This will:
> 1. Scaffold the new `.ai/commands-gemini/` directory with `.toml` templates (without overwriting existing files)
> 2. Create new symlinks: `AGENTS.md`, `.gemini/skills/`, `.github/skills/`
> 3. The old `commands → .gemini/commands` symlink (now stale) can be removed manually or via `dotai doctor --fix`
>
> ```bash
> npm install -g @nbslabs/dotai   # upgrade
> cd your-project
> dotai init                       # re-scaffolds missing dirs + re-links
> ```

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
