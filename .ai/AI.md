# AI Instructions — dotai

A single-source-of-truth CLI that manages AI coding tool configs from one `.ai/` folder, symlinking them to each tool's native directory.

## Architecture
- `src/core/` — Core logic: symlink engine, config management, tool registry, scaffolding
- `src/commands/` — Yargs command modules (init, link, unlink, status, add, remove, list, sync, doctor)
- `src/utils/` — Logger, FS helpers, prompt wrappers

## Tech Stack
- TypeScript (CJS output via tsup)
- Node.js >= 18
- yargs (CLI framework)
- picocolors (terminal colors)
- @inquirer/prompts (interactive prompts)
- vitest (testing)

## Coding Conventions
- Use `fs/promises` for all file operations
- Always use relative symlinks for portability
- Route all output through `logger.ts`, never use `console.log` in commands
- Handle Windows junctions vs Unix symlinks in `platform.ts`

## Commands
- `npm run build` — Build with tsup
- `npm test` — Run vitest tests
- `npm run lint` — TypeScript type check
- `npm run dev` — Watch mode build

## Important Notes
- Template content is inlined in `scaffold.ts` rather than separate files
- All symlinks must be relative for repository portability
- Never delete non-symlink files without `--force` confirmation
- Single AI.md file symlinks to CLAUDE.md, GEMINI.md, AGENTS.md etc.
