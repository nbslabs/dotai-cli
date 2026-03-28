# Changelog

All notable changes to this project will be documented in this file.

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
