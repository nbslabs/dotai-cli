# Changelog

All notable changes to this project will be documented in this file.

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
