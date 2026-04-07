# dotai v2.0.0 — Master Implementation Prompt

> **Agent Instructions**: This is a complete, self-contained implementation spec for upgrading
> `@nbslabs/dotai` from v1.1.0 to v2.0.0. Read this entire document before writing a single
> line of code. Implement every section in order. Do not skip any file listed under
> "Files to Create or Modify". Ask no clarifying questions — all decisions are made here.

---

## 0. Pre-Flight Checklist

Before starting, confirm the following about the existing codebase:

- Entry point: `src/index.ts`
- Commands live in: `src/commands/`
- Core logic lives in: `src/core/`
- Utilities live in: `src/utils/`
- Tests live in: `tests/`
- Build tool: `tsup` (CJS output)
- Test runner: `vitest`
- Package name: `@nbslabs/dotai`
- Current version: `1.1.0` → bump to `2.0.0`

---

## 1. Version Bump

Update the `version` field in `package.json` from `1.1.0` to `2.0.0`. The build system
already injects this via `tsup define → __PKG_VERSION__`, so no other change is needed for
version propagation.

---

## 2. Feature Overview — `dotai knowledge`

### Problem Being Solved

When an AI agent starts a new conversation, it has no memory of the previous session.
It re-explores the same codebase from scratch every time — wasting context tokens, wasting
time, and missing accumulated insights (edge cases, patterns, gotchas) that were only
discovered mid-conversation.

### Solution

Add a `knowledge/` directory inside `.ai/` that acts as a **persistent agent memory layer**.
It is populated by a new `dotai knowledge` command family. Because `knowledge/` lives inside
`.ai/`, it is automatically symlinked to all configured AI tools via the existing symlink
engine — zero extra integration required.

Every new conversation starts with this pre-built knowledge already in context.

---

## 3. New Directory Structure

After `dotai knowledge scan` runs, the `.ai/` directory gains:

```
.ai/
├── AI.md                            ← unchanged
├── DOTAI.md                         ← updated template (section 12)
├── rules/
├── commands/
│   ├── review.md
│   ├── deploy.md
│   └── learn.md                     ← NEW: agent slash command to write back
├── skills/
├── settings/
├── ignore/
├── workflows/
└── knowledge/                       ← NEW root
    ├── INDEX.md                     ← High-level codebase map (auto-generated)
    ├── patterns.md                  ← Recurring code patterns discovered
    ├── gotchas.md                   ← Edge cases, bugs fixed, do-NOT lists
    ├── changelog.md                 ← Recent significant changes (git-driven)
    ├── modules/                     ← Per-module deep summaries
    │   └── <module-name>.md
    └── decisions/                   ← Architecture decision records (human + agent)
        └── .gitkeep
```

All files inside `knowledge/` are **committed to git** — they are the source of truth,
not generated artifacts. The scanner writes them; humans and agents can edit them freely.

---

## 4. New Source Files to Create

Create the following files. Full implementation detail for each is in section 7.

```
src/commands/knowledge.ts          ← yargs CommandModule (router for subcommands)
src/core/knowledge/scanner.ts      ← Codebase AST/heuristic scanner
src/core/knowledge/watcher.ts      ← chokidar-based file watcher
src/core/knowledge/mcp.ts          ← MCP stdio server
src/core/knowledge/git.ts          ← git integration helpers
src/core/knowledge/renderer.ts     ← markdown generation helpers
src/core/knowledge/types.ts        ← shared TypeScript types
tests/knowledge.test.ts            ← vitest tests
```

---

## 5. Files to Modify

```
package.json                       ← version 2.0.0, add dependencies
src/index.ts                       ← register knowledge command
src/core/registry.ts               ← add knowledge/ symlink entries per tool
src/core/scaffold.ts               ← scaffold knowledge/ skeleton + learn.md command
src/core/config.ts                 ← add knowledge config fields to DotAiConfig
README.md                          ← full rewrite with v2 content
CHANGELOG.md                       ← prepend [2.0.0] block
docs/index.html                    ← update landing page for v2
```

---

## 6. New Dependencies

Add to `dependencies` in `package.json`:

```json
"chokidar": "^4.0.3",
"ignore": "^6.0.2"
```

Add to `devDependencies`:

```json
"@types/node": "^18.19.68"
```

`chokidar` is already a transitive dep (via `tsup`) — add it as a direct dep so it is
bundled reliably. `ignore` parses `.gitignore` patterns for the scanner to respect them.

Do NOT add `tree-sitter` or any native bindings. The scanner uses regex-based heuristics
only — this keeps the package pure JS/TS and installable without build tools.

---

## 7. Full Implementation Spec

### 7.1 `src/core/knowledge/types.ts`

```typescript
export interface ModuleInfo {
  name: string           // directory or logical name
  path: string           // relative path from project root
  files: FileInfo[]
  dependencies: string[] // other module names this depends on
  dependents: string[]   // other module names that depend on this
  lastScanned: string    // ISO timestamp
  commitHash?: string    // git commit at time of scan
}

export interface FileInfo {
  relativePath: string
  language: string       // 'typescript' | 'javascript' | 'java' | 'python' | 'go' | 'unknown'
  exports: string[]      // exported class/function names
  imports: string[]      // imported module paths (raw strings)
  topLevelSymbols: SymbolInfo[]
  lineCount: number
}

export interface SymbolInfo {
  name: string
  kind: 'class' | 'function' | 'interface' | 'type' | 'enum' | 'variable' | 'method'
  isExported: boolean
  decorators?: string[]  // e.g. @Service, @RestController for Java/Spring
  signature?: string     // brief signature string, no body
}

export interface ScanResult {
  projectRoot: string
  scannedAt: string
  commitHash?: string
  modules: ModuleInfo[]
  totalFiles: number
}

export interface KnowledgeConfig {
  enabled: boolean
  scanDepth: number           // how many directory levels to treat as modules (default: 2)
  excludePatterns: string[]   // glob patterns to skip
  autoUpdateOnCommit: boolean // whether git hook is installed
  mcpPort?: number            // if set, serve MCP on this port (else stdio)
}
```

---

### 7.2 `src/core/knowledge/scanner.ts`

Implement a `KnowledgeScanner` class. Keep every method under 60 lines.

#### `KnowledgeScanner` class interface:

```typescript
export class KnowledgeScanner {
  constructor(projectRoot: string, config: KnowledgeConfig) {}

  // Entry point: scan the entire project
  async scanAll(): Promise<ScanResult> {}

  // Incremental: only re-scan files changed since lastCommit
  async scanChanged(changedFiles: string[]): Promise<ModuleInfo[]> {}

  // Scan a single directory as a module
  async scanModule(modulePath: string): Promise<ModuleInfo> {}

  // Detect language from file extension
  private detectLanguage(filePath: string): FileInfo['language'] {}

  // Extract symbols using regex (no native AST)
  private extractSymbols(content: string, language: string): SymbolInfo[] {}

  // Extract import paths using regex
  private extractImports(content: string, language: string): string[] {}

  // Resolve cross-module dependencies by comparing import paths to known modules
  private resolveDependencies(modules: ModuleInfo[]): ModuleInfo[] {}

  // Respect .gitignore and custom excludePatterns
  private shouldSkip(filePath: string): boolean {}
}
```

#### Symbol extraction regex patterns (implement these):

**TypeScript / JavaScript:**
- Exported class: `/^export\s+(abstract\s+)?class\s+(\w+)/m`
- Exported function: `/^export\s+(async\s+)?function\s+(\w+)/m`
- Exported const/arrow: `/^export\s+const\s+(\w+)\s*=/m`
- Interface: `/^export\s+interface\s+(\w+)/m`
- Type alias: `/^export\s+type\s+(\w+)/m`
- Enum: `/^export\s+enum\s+(\w+)/m`
- Imports: `/^import\s+.*?\s+from\s+['"](.+?)['"]/gm`

**Java:**
- Class: `/^public\s+(abstract\s+|final\s+)?class\s+(\w+)/m`
- Interface: `/^public\s+interface\s+(\w+)/m`
- Public method: `/^\s+public\s+[\w<>\[\]]+\s+(\w+)\s*\(/gm`
- Decorators/Annotations: `/@(\w+)/gm` (capture lines before class/method)
- Imports: `/^import\s+([\w.]+);/gm`

**Python:**
- Class: `/^class\s+(\w+)/m`
- Function: `/^def\s+(\w+)/m` and `/^async\s+def\s+(\w+)/m`
- Imports: `/^(?:from\s+(\S+)\s+)?import\s+(.+)/gm`

**Go:**
- Function: `/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/m`
- Struct: `/^type\s+(\w+)\s+struct/m`
- Interface: `/^type\s+(\w+)\s+interface/m`

For unknown languages: record `lineCount` and `relativePath` only, leave `exports` empty.

#### File discovery rules:
- Walk directories up to `config.scanDepth` levels
- Skip: `node_modules`, `.git`, `dist`, `build`, `out`, `target`, `*.min.js`,
  `*.map`, `*.lock`, `*.generated.*`, files > 500KB
- Respect entries in `.gitignore` using the `ignore` npm package
- Respect `config.excludePatterns`

---

### 7.3 `src/core/knowledge/renderer.ts`

Converts `ScanResult` / `ModuleInfo` into markdown strings.

```typescript
export class KnowledgeRenderer {
  // Render .ai/knowledge/INDEX.md
  renderIndex(result: ScanResult): string {}

  // Render .ai/knowledge/modules/<name>.md
  renderModule(module: ModuleInfo): string {}

  // Render initial .ai/knowledge/patterns.md (skeleton only)
  renderPatterns(): string {}

  // Render initial .ai/knowledge/gotchas.md (skeleton only)
  renderGotchas(): string {}

  // Render initial .ai/knowledge/changelog.md (skeleton only)
  renderChangelog(): string {}

  // Append a changelog entry (called on incremental update)
  appendChangelogEntry(existing: string, changedFiles: string[], commitHash: string, commitMessage: string): string {}
}
```

#### `renderIndex` output format:

```markdown
# Codebase Knowledge Index
> Auto-generated by dotai knowledge scan | v2.0.0
> Last scanned: {ISO timestamp} | Commit: {short hash}
> Total files: {N} across {M} modules

## Module Map

| Module | Path | Files | Key Exports | Depends On |
|--------|------|-------|-------------|------------|
| auth   | src/auth | 4 | AuthService, JwtFilter | core, db |
| ...    | ...  | ... | ...         | ...        |

## Dependency Graph

<!-- Read this to understand what depends on what before making changes -->
- **auth** → core, db
- **payment** → core, db, notification
- ...

## Quick Reference

<!-- Auto-populated from module scans -->
| Symbol | Module | Kind |
|--------|--------|------|
| AuthService | auth | class |
| processPayment | payment | function |
| ...
```

#### `renderModule` output format:

```markdown
# {Module Name}
> Auto-generated | Last updated: {timestamp} | Commit: {hash}
> Path: `{relative path}`

## Files
| File | Lines | Key Symbols |
|------|-------|-------------|
| AuthService.ts | 142 | AuthService, validateToken |
| ...

## Key Symbols

### Classes
- `AuthService` — {decorator if any, e.g. @Injectable}
- ...

### Functions / Methods
- `validateToken(token: string): boolean`
- ...

### Interfaces / Types
- `AuthUser`, `TokenPayload`

## Dependencies
- **Imports from**: `core`, `db`, `../utils`
- **Imported by**: `api`, `middleware`

## Patterns Observed
<!-- dotai auto-detects and humans/agents append here -->

## Gotchas & Edge Cases
<!-- Agents and humans append here — do NOT delete these -->
```

#### Important rendering rules:
- Every auto-generated file has a header comment: `<!-- AUTO-GENERATED: safe to edit, do not delete header -->`
- Never overwrite `## Gotchas & Edge Cases` or `## Patterns Observed` sections if they
  already contain content below the heading. Merge by appending, never replacing.
- Use `appendChangelogEntry` for incremental updates — never rewrite the whole file.

---

### 7.4 `src/core/knowledge/git.ts`

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

// Get the short hash of HEAD
export async function getCurrentCommitHash(projectRoot: string): Promise<string | null> {}

// Get the commit message of HEAD
export async function getCurrentCommitMessage(projectRoot: string): Promise<string | null> {}

// Get list of files changed between two commits (or HEAD~1..HEAD)
export async function getChangedFiles(
  projectRoot: string,
  fromRef: string = 'HEAD~1',
  toRef: string = 'HEAD'
): Promise<string[]> {}

// Install post-commit git hook
export async function installGitHook(projectRoot: string): Promise<void> {}

// Uninstall post-commit git hook
export async function uninstallGitHook(projectRoot: string): Promise<void> {}

// Check if git hook is installed
export async function isGitHookInstalled(projectRoot: string): Promise<boolean> {}
```

#### Git hook content (write this string into `.git/hooks/post-commit`):

```bash
#!/bin/sh
# dotai knowledge auto-update hook
# Installed by: dotai knowledge hook install
# Remove with: dotai knowledge hook uninstall

if command -v dotai >/dev/null 2>&1; then
  dotai knowledge update --silent
else
  npx --no-install dotai knowledge update --silent 2>/dev/null || true
fi
```

Make the hook file executable (`chmod +x`).

Mark the hook with a comment signature `# dotai-hook-v2` so `uninstallGitHook` can
identify and safely remove only dotai-managed hooks.

---

### 7.5 `src/core/knowledge/watcher.ts`

```typescript
import chokidar from 'chokidar'

export class KnowledgeWatcher {
  constructor(
    private projectRoot: string,
    private config: KnowledgeConfig,
    private onChanged: (files: string[]) => Promise<void>
  ) {}

  start(): void {
    // Watch src/ (or project root, excluding node_modules, dist, .ai, .git)
    // Debounce 1500ms to batch rapid saves
    // On change: collect changed files, call onChanged
  }

  stop(): void {}
}
```

Debounce implementation: collect all changed paths in a `Set` during the debounce window,
then flush the set to `onChanged` as an array. Reset the set after each flush.

---

### 7.6 `src/core/knowledge/mcp.ts`

Implement an MCP (Model Context Protocol) stdio server. MCP uses JSON-RPC 2.0 over stdio.

```typescript
export class KnowledgeMcpServer {
  constructor(private knowledgePath: string) {}

  // Start listening on stdin, writing to stdout
  async start(): Promise<void> {}

  // Handle a JSON-RPC request object
  private async handleRequest(req: McpRequest): Promise<McpResponse> {}

  // Tool: knowledge_query — search knowledge files for a question
  private async toolQuery(question: string): Promise<string> {}

  // Tool: knowledge_get_module — return full module knowledge file
  private async toolGetModule(name: string): Promise<string> {}

  // Tool: knowledge_recent_changes — return changelog since date or N lines
  private async toolRecentChanges(limit?: number): Promise<string> {}

  // Tool: knowledge_list_modules — list all available modules
  private async toolListModules(): Promise<string> {}
}
```

#### MCP tools manifest (respond to `tools/list`):

```json
{
  "tools": [
    {
      "name": "knowledge_query",
      "description": "Search the codebase knowledge base for information about a topic, module, or concept",
      "inputSchema": {
        "type": "object",
        "properties": {
          "question": { "type": "string", "description": "What you want to know about the codebase" }
        },
        "required": ["question"]
      }
    },
    {
      "name": "knowledge_get_module",
      "description": "Get the full knowledge summary for a specific module or directory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Module name as shown in INDEX.md" }
        },
        "required": ["name"]
      }
    },
    {
      "name": "knowledge_recent_changes",
      "description": "Get recent codebase changes from the knowledge changelog",
      "inputSchema": {
        "type": "object",
        "properties": {
          "limit": { "type": "number", "description": "Number of changelog entries to return (default 10)" }
        }
      }
    },
    {
      "name": "knowledge_list_modules",
      "description": "List all modules in the knowledge base with a one-line summary",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ]
}
```

#### `toolQuery` implementation:
Simple keyword search — not vector search. Split the question into words, search all
`knowledge/**/*.md` files for lines containing any of the words, return the top 20 matching
lines with their file context. Format as markdown.

#### Stdio JSON-RPC loop:
```typescript
// Read line-delimited JSON from process.stdin
// Parse each line as a JSON-RPC 2.0 request
// Write JSON-RPC 2.0 response to process.stdout
// Never crash on malformed input — return error response
```

---

### 7.7 `src/commands/knowledge.ts`

This is a yargs `CommandModule` that routes subcommands. Implement as a top-level
`knowledge` command with the following subcommands:

#### `dotai knowledge scan [path]`
```
Options:
  --depth <n>       How many directory levels = one module (default: from config, fallback 2)
  --module <name>   Scan only this module path (incremental)
  --silent          Suppress output (used by git hook)
  --dry-run         Show what would be scanned, write nothing
```

Behavior:
1. Read config from `.dotai.json` — get `knowledge` config block
2. Instantiate `KnowledgeScanner`
3. Run scan
4. Instantiate `KnowledgeRenderer`
5. For each module: if `modules/<name>.md` does NOT exist → create it (full render)
6. If `modules/<name>.md` DOES exist → merge (preserve Gotchas/Patterns sections, update rest)
7. Always overwrite `INDEX.md` (it is fully auto-generated, no manual sections)
8. Create `patterns.md`, `gotchas.md`, `changelog.md` if they don't exist (skeleton only)
9. Print summary: `Scanned N files across M modules → .ai/knowledge/`

#### `dotai knowledge update`
```
Options:
  --silent    Suppress output
```

Behavior:
1. Get list of changed files since last commit via `git.ts`
2. Run `scanner.scanChanged(changedFiles)`
3. Update only the affected module files (merge, preserve manual sections)
4. Append to `changelog.md` via `renderer.appendChangelogEntry`
5. Regenerate `INDEX.md`

This is what the git hook calls.

#### `dotai knowledge watch`
```
Options:
  --silent    Suppress startup banner
```

Behavior:
1. Print `Watching for changes... (Ctrl+C to stop)`
2. Instantiate `KnowledgeWatcher`
3. On each change batch: run `dotai knowledge update` logic inline (no subprocess)
4. Print `Updated N module(s)` after each batch

#### `dotai knowledge serve`
```
Options:
  --stdio    Use stdio transport (default, for MCP clients like Claude Code)
  --port <n> Use HTTP SSE transport on this port (future — stub with 'not yet implemented')
```

Behavior:
1. Check `.ai/knowledge/` exists — error if not (run `scan` first)
2. Print `dotai knowledge MCP server running (stdio)` to **stderr** (not stdout — stdout is JSON-RPC)
3. Instantiate `KnowledgeMcpServer`
4. Call `server.start()` — blocks until process exits

#### `dotai knowledge hook`
```
Subcommands:
  install      Install git post-commit hook
  uninstall    Remove git post-commit hook
  status       Show whether hook is installed
```

#### `dotai knowledge status`
Show:
- Last scan timestamp (read from `INDEX.md` header)
- Number of modules indexed
- Whether git hook is installed
- Whether knowledge directory exists
- Staleness warning if last scan > 7 days ago

#### `dotai knowledge clean`
Delete `.ai/knowledge/` entirely. Prompts for confirmation unless `--yes` flag.

#### `dotai knowledge append`
```
Options:
  --module <name>    Target module file (required unless --gotchas or --patterns)
  --gotchas          Append to .ai/knowledge/gotchas.md
  --patterns         Append to .ai/knowledge/patterns.md
  --finding <text>   The finding to append (required)
  --agent <name>     Who discovered this (default: 'human')
```

Behavior: Append a timestamped finding to the target file. This is also callable by agents
via the `/learn` Claude command.

---

### 7.8 Register in `src/index.ts`

Add the following import and command registration:

```typescript
import { knowledgeCommand } from './commands/knowledge'

// add after existing commands:
.command(knowledgeCommand)
```

---

### 7.9 Update `src/core/config.ts`

Add `knowledge` to `DotAiConfig`:

```typescript
export interface DotAiConfig {
  version: string
  tools: string[]
  aiDir: string
  gitignore: boolean
  links: Record<string, ToolLinkState>
  knowledge?: KnowledgeConfig    // NEW — optional for backward compat
}
```

Import `KnowledgeConfig` from `src/core/knowledge/types.ts`.

Add a helper:

```typescript
export function getKnowledgeConfig(config: DotAiConfig): KnowledgeConfig {
  return config.knowledge ?? {
    enabled: false,
    scanDepth: 2,
    excludePatterns: [],
    autoUpdateOnCommit: false,
  }
}
```

The `knowledge.enabled` field defaults to `false`. It becomes `true` after the first
successful `dotai knowledge scan`.

---

### 7.10 Update `src/core/registry.ts`

Add a `knowledge/` symlink entry to the following tools so agents can access knowledge
files via their native directories:

**claude:**
```typescript
{
  source: 'knowledge',
  target: '.claude/knowledge',
  strategy: { type: 'dir-symlink' },
  required: false,
  description: 'Persistent codebase knowledge base',
},
```

**gemini / antigravity:**
```typescript
{
  source: 'knowledge',
  target: '.gemini/knowledge',
  strategy: { type: 'dir-symlink' },
  required: false,
  description: 'Persistent codebase knowledge base',
},
```

**copilot:**
```typescript
{
  source: 'knowledge',
  target: '.github/knowledge',
  strategy: { type: 'dir-symlink' },
  required: false,
  description: 'Persistent codebase knowledge base',
},
```

**cursor, windsurf, codex:** Do NOT add knowledge symlinks — these tools do not read
arbitrary markdown directories from their config paths.

Also add `.github/knowledge` to `copilot.gitignore` entries.

---

### 7.11 Update `src/core/scaffold.ts`

#### Add `learn.md` command template:

Add to the `templates` record in `getTemplateContent`:

```typescript
'learn.md': `# /learn

When you discover something important about the codebase that is not already documented:

## For module-specific findings:
Run: \`dotai knowledge append --module <module-name> --finding "<your discovery>" --agent "claude"\`

## For general gotchas (edge cases, bugs fixed, things to never do):
Run: \`dotai knowledge append --gotchas --finding "<your discovery>" --agent "claude"\`

## For patterns (recurring code patterns you notice):
Run: \`dotai knowledge append --patterns --finding "<your discovery>" --agent "claude"\`

## Guidelines for good findings:
- Be specific: include file names, function names, variable names
- Explain WHY, not just what
- Include the symptom if it's a gotcha (e.g. "causes X to fail when Y")
- Keep findings under 3 sentences each
`,
```

Add to the `files` array in `scaffoldAiDir`:

```typescript
{ relPath: 'commands/learn.md', templateName: 'learn.md', content: '' },
```

#### Add knowledge skeleton templates:

Add these to `getTemplateContent`:

```typescript
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
```

Add to the `files` array, all with `required: false`:

```typescript
{ relPath: 'knowledge/INDEX.md',    templateName: 'knowledge-index.md',    content: '' },
{ relPath: 'knowledge/patterns.md', templateName: 'knowledge-patterns.md', content: '' },
{ relPath: 'knowledge/gotchas.md',  templateName: 'knowledge-gotchas.md',  content: '' },
{ relPath: 'knowledge/changelog.md',templateName: 'knowledge-changelog.md',content: '' },
```

Also create the `decisions/` directory and `.gitkeep`:

```typescript
await ensureDir(join(aiPath, 'knowledge', 'modules'))
await ensureDir(join(aiPath, 'knowledge', 'decisions'))
// write .gitkeep to decisions/
```

---

### 7.12 Update `DOTAI.md` template in `src/core/scaffold.ts`

Replace the entire `'DOTAI.md'` template string. Key changes:

1. Add a `## Knowledge Base` section explaining the new system
2. Update the Generated Structure diagram to show `knowledge/`
3. Add `knowledge/` symlink mappings to the symlink table
4. Add new commands to the Useful Commands table

The new `## Knowledge Base` section to add (insert before `## What to Edit`):

````markdown
## Knowledge Base (v2.0.0+)

dotai v2 adds a **persistent agent memory layer** at `.ai/knowledge/`. Every new
conversation starts with pre-built codebase knowledge already in context — no more
re-exploring the same code from scratch.

### Initialize

```bash
dotai knowledge scan          # scan codebase → populate .ai/knowledge/
dotai knowledge hook install  # auto-update knowledge on every git commit
```

### Files in `.ai/knowledge/`

| File | Purpose | Updated by |
|------|---------|------------|
| `INDEX.md` | High-level module map + symbol table | Auto (scanner) |
| `modules/<name>.md` | Deep per-module summary | Auto (scanner) + humans/agents |
| `patterns.md` | Recurring code patterns | Humans + agents (/learn) |
| `gotchas.md` | Edge cases and do-NOT rules | Humans + agents (/learn) |
| `changelog.md` | Recent code changes | Auto (git hook) |
| `decisions/*.md` | Architecture decisions | Humans only |

### Agent Integration

All knowledge files are symlinked into Claude's `.claude/knowledge/`, Gemini's
`.gemini/knowledge/`, and Copilot's `.github/knowledge/`. Agents can read and
write to these files during conversations.

Use the `/learn` command in Claude/Gemini to have the agent write findings back:
```
/learn I discovered that PaymentService uses HALF_UP rounding — never change to HALF_EVEN
```

For MCP-compatible clients (Claude Code), add to `.ai/settings/claude.json`:
```json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "dotai",
      "args": ["knowledge", "serve", "--stdio"]
    }
  }
}
```
````

Update the commands table to add:

```markdown
| `dotai knowledge scan`    | Scan codebase → generate .ai/knowledge/    |
| `dotai knowledge watch`   | Auto-update knowledge on file changes       |
| `dotai knowledge serve`   | Start MCP server for agent tool access      |
| `dotai knowledge hook`    | Manage git post-commit hook                 |
| `dotai knowledge status`  | Show knowledge base health                  |
| `dotai knowledge append`  | Add a finding to gotchas or module          |
```

---

## 8. Tests to Write (`tests/knowledge.test.ts`)

Write vitest tests covering:

```typescript
describe('KnowledgeScanner', () => {
  it('detects TypeScript exports correctly')
  it('detects Java public methods correctly')
  it('detects Python class and function definitions')
  it('skips node_modules and dist directories')
  it('respects excludePatterns config')
  it('resolves cross-module dependencies')
  it('handles files larger than 500KB gracefully')
  it('returns empty exports for unknown language files')
})

describe('KnowledgeRenderer', () => {
  it('renders INDEX.md with correct module table')
  it('renders module file with all sections')
  it('does not overwrite Gotchas section on re-render')
  it('appendChangelogEntry prepends new entry')
  it('generates valid markdown (no broken table rows)')
})

describe('knowledge git helpers', () => {
  it('getChangedFiles returns empty array when git not available')
  it('isGitHookInstalled returns false when hook missing')
})
```

Use `mkdtemp` + `afterEach` cleanup pattern matching existing tests.

---

## 9. `README.md` — Full Rewrite

Replace the entire `README.md`. Keep the same HTML badge section at the top. Key changes:

### Tagline update:
```
One `.ai/` folder. All your AI tools. Always in sync. Always in context.
```

### New "Why dotai v2?" section (add after badges, before "Why dotai?"):

```markdown
## What's New in v2.0.0 — Persistent Agent Memory

AI agents reset their memory every conversation. They re-explore your codebase from
scratch each time — wasting context, wasting tokens, missing accumulated insights.

**dotai v2 solves this** with a persistent knowledge layer:

```bash
dotai knowledge scan          # one-time: scan your codebase
dotai knowledge hook install  # auto-update knowledge on every commit
```

Now every conversation starts with your codebase already understood.
```

### Add a new `## Knowledge Base` section after the existing `## Commands` section:

````markdown
## Knowledge Base

`dotai knowledge` builds and maintains a persistent codebase memory layer at `.ai/knowledge/`.

### Quick Start

```bash
dotai knowledge scan          # scan codebase → .ai/knowledge/
dotai knowledge hook install  # auto-update after each git commit
```

### Knowledge Commands

| Command | Description |
|---|---|
| `dotai knowledge scan` | Full codebase scan → generate/update knowledge files |
| `dotai knowledge scan --module <path>` | Incremental scan of one module |
| `dotai knowledge update` | Update from last git commit changes |
| `dotai knowledge watch` | Watch mode — update on file save |
| `dotai knowledge serve` | MCP stdio server for Claude Code + Gemini CLI |
| `dotai knowledge hook install` | Install git post-commit hook |
| `dotai knowledge hook uninstall` | Remove git post-commit hook |
| `dotai knowledge status` | Show knowledge base health + staleness |
| `dotai knowledge append` | Add a finding to gotchas or a module |
| `dotai knowledge clean` | Delete knowledge base (re-scan fresh) |

### MCP Integration (Claude Code)

Add to `.ai/settings/claude.json`:

```json
{
  "mcpServers": {
    "dotai-knowledge": {
      "command": "dotai",
      "args": ["knowledge", "serve", "--stdio"]
    }
  }
}
```

Claude Code will then have access to `knowledge_query`, `knowledge_get_module`,
`knowledge_recent_changes`, and `knowledge_list_modules` tools in every conversation.

### Agent-Writable Knowledge

Agents can write back to the knowledge base mid-conversation using the `/learn` command
(added to `.ai/commands/learn.md` by dotai init):

```
/learn The PaymentService.processRefund() requires ROLE_ADMIN — calling without it throws 403 silently
```

This appends the finding to `.ai/knowledge/gotchas.md` with a timestamp and agent attribution.
````

### Update the Supported Tools table to add a `Knowledge` column:

```markdown
| `claude`      | Claude Code | `.claude/` | AI.md, settings, commands, skills, **knowledge** |
| `gemini`      | Gemini CLI  | `.gemini/` | AI.md, settings, commands, ignore, **knowledge** |
| `copilot`     | GitHub Copilot | `.github/` | AI.md, prompts, instructions, **knowledge** |
```

---

## 10. `CHANGELOG.md` — Prepend v2.0.0 Block

Prepend the following block at the top (before the existing `## [1.1.0]` entry):

```markdown
## [2.0.0] - 2026-04-01

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
```

---

## 11. `docs/index.html` — Landing Page Updates

Make the following targeted changes to `docs/index.html`:

### 1. Update the `<title>` and `<meta name="description">`:
```html
<title>dotai — One .ai/ folder. All your AI tools. Always in sync. Always in context.</title>
<meta name="description" content="dotai is a CLI that manages AI coding tool configs and persistent agent knowledge from a single .ai/ folder. Supports Claude, Gemini, Cursor, Copilot, Windsurf, Codex, Antigravity.">
```

### 2. Update the hero `<h1>`:
```html
<h1>
  One <code>.ai/</code> folder.<br>
  <span class="gradient">All your AI tools.</span><br>
  Always in sync. Always in context.
</h1>
```

### 3. Update the hero `<p>` subtitle:
```html
<p>
  Stop maintaining separate configs for every AI coding tool — and stop letting agents
  re-explore your codebase from scratch every session. dotai manages Claude, Gemini,
  Cursor, Copilot, Windsurf, Codex &amp; Antigravity from a single directory, with
  a persistent knowledge layer that survives across conversations.
</p>
```

### 4. Add a new `<section id="knowledge">` between the existing `#quick-start` and `#tools` sections:

```html
<section id="knowledge">
  <div class="container">
    <div class="section-label">v2.0 — New</div>
    <h2>Persistent Agent Memory</h2>
    <p>
      AI agents reset their context every conversation. dotai v2 solves this with a
      knowledge layer that any agent can read from the first message.
    </p>
    <div class="code-block"><span class="comment"># One-time setup</span>
<span class="prompt">$</span> dotai knowledge scan
<span class="prompt">$</span> dotai knowledge hook install

<span class="comment"># Now every conversation starts with your codebase understood</span>
<span class="comment"># Agents can also write back findings via /learn or dotai knowledge append</span></div>
    <div class="cards">
      <div class="card">
        <h3>🔍 Codebase Scanner</h3>
        <p>Regex-based AST scanner for TypeScript, JavaScript, Java, Python, Go. Generates per-module markdown summaries with exports, imports, and dependency graph.</p>
      </div>
      <div class="card">
        <h3>🔄 Auto-Update</h3>
        <p>Git post-commit hook + file watcher keep knowledge fresh automatically. Incremental updates touch only changed modules.</p>
      </div>
      <div class="card">
        <h3>🔌 MCP Server</h3>
        <p>Expose knowledge as MCP tools to Claude Code and Gemini CLI. Agents query <code>knowledge_query</code>, <code>knowledge_get_module</code>, and more without re-reading source files.</p>
      </div>
      <div class="card">
        <h3>✍️ Agent-Writable</h3>
        <p>Agents append findings mid-conversation via <code>/learn</code> command or <code>dotai knowledge append</code>. Gotchas and patterns persist forever.</p>
      </div>
    </div>
  </div>
</section>
```

### 5. Add knowledge commands to the existing `#commands` table:

After the last row (`dotai doctor`), add:

```html
<tr>
  <td><code>dotai knowledge scan</code></td>
  <td>Scan codebase → generate <code>.ai/knowledge/</code> module summaries</td>
  <td>
    <code>--module &lt;path&gt;</code> incremental scan<br>
    <code>--depth &lt;n&gt;</code> directory depth for modules<br>
    <code>--dry-run</code> preview without writing<br>
    <code>--silent</code> suppress output
  </td>
</tr>
<tr>
  <td><code>dotai knowledge update</code></td>
  <td>Incremental update from last git commit diff</td>
  <td><code>--silent</code> suppress output</td>
</tr>
<tr>
  <td><code>dotai knowledge watch</code></td>
  <td>Watch files, auto-update knowledge on save</td>
  <td><code>--silent</code> suppress banner</td>
</tr>
<tr>
  <td><code>dotai knowledge serve</code></td>
  <td>Start MCP stdio server for agent tool access</td>
  <td><code>--stdio</code> (default) | <code>--port &lt;n&gt;</code> (stub)</td>
</tr>
<tr>
  <td><code>dotai knowledge hook &lt;install|uninstall|status&gt;</code></td>
  <td>Manage git post-commit auto-update hook</td>
  <td>—</td>
</tr>
<tr>
  <td><code>dotai knowledge status</code></td>
  <td>Show knowledge base health and staleness</td>
  <td>—</td>
</tr>
<tr>
  <td><code>dotai knowledge append</code></td>
  <td>Add a finding to gotchas, patterns, or a module</td>
  <td>
    <code>--module &lt;name&gt;</code><br>
    <code>--gotchas</code> | <code>--patterns</code><br>
    <code>--finding &lt;text&gt;</code><br>
    <code>--agent &lt;name&gt;</code>
  </td>
</tr>
<tr>
  <td><code>dotai knowledge clean</code></td>
  <td>Delete knowledge base for fresh re-scan</td>
  <td><code>--yes</code> skip confirmation</td>
</tr>
```

### 6. Add `#knowledge` link to the nav:

```html
<a href="#knowledge" class="hide-mobile">Knowledge</a>
```

---

## 12. Error Handling Requirements

Every new command must follow the existing pattern:

```typescript
try {
  // command body
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  logger.error(`Knowledge scan failed: ${message}`)
  process.exit(1)
}
```

Additionally:
- If `git` is not available, `git.ts` functions must return graceful defaults
  (empty arrays, null hashes) — never throw. Log a `logger.dim` note.
- If `knowledge/` directory does not exist when running `serve`, `update`, or
  `status`, print a clear actionable error:
  `No knowledge base found. Run 'dotai knowledge scan' first.`
- The MCP server must never write to `stdout` except valid JSON-RPC responses.
  All logging goes to `stderr`.

---

## 13. Coding Conventions (match existing codebase)

- All file I/O: `fs/promises` only
- All output: route through `logger.ts` (never `console.log` in commands)
  Exception: MCP server writes JSON-RPC to `process.stdout` directly
- TypeScript strict mode: no `any`, no `!` non-null assertions on external data
- Keep functions under 60 lines; extract helpers
- Use `logger.title()` at the start of every command handler
- Use `logger.dim()` for secondary/verbose info
- `--silent` flag: when set, suppress all `logger.*` calls except `logger.error`

---

## 14. Build & Test Verification

After implementation, these must all pass:

```bash
npm run lint       # tsc --noEmit — zero errors
npm test           # vitest run — all tests pass including new knowledge tests
npm run build      # tsup — builds without errors
```

After build, smoke-test:

```bash
node dist/index.js knowledge --help
node dist/index.js knowledge scan --dry-run
node dist/index.js knowledge status
```

---

## 15. Implementation Order

Follow this exact order to avoid circular dependency issues:

1. `src/core/knowledge/types.ts`
2. `src/core/knowledge/git.ts`
3. `src/core/knowledge/scanner.ts`
4. `src/core/knowledge/renderer.ts`
5. `src/core/knowledge/watcher.ts`
6. `src/core/knowledge/mcp.ts`
7. `src/core/config.ts` (add KnowledgeConfig)
8. `src/core/registry.ts` (add knowledge symlinks)
9. `src/core/scaffold.ts` (add knowledge templates + learn.md)
10. `src/commands/knowledge.ts`
11. `src/index.ts` (register command)
12. `tests/knowledge.test.ts`
13. `package.json` (version + deps)
14. `README.md`
15. `CHANGELOG.md`
16. `docs/index.html`

---

## 16. Definition of Done

The implementation is complete when:

- [ ] `dotai knowledge scan` runs on the dotai repo itself and produces
      `.ai/knowledge/INDEX.md` + at least one `modules/*.md` file
- [ ] `dotai knowledge serve --stdio` responds to a JSON-RPC `tools/list` request
- [ ] `dotai knowledge hook install` creates `.git/hooks/post-commit`
- [ ] `dotai init` on a fresh directory creates the `knowledge/` skeleton structure
      and the `learn.md` command file
- [ ] `dotai knowledge append --gotchas --finding "test" --agent "test"` appends to
      `.ai/knowledge/gotchas.md`
- [ ] `npm run lint` passes with zero errors
- [ ] `npm test` passes with all tests including new knowledge tests
- [ ] `npm run build` succeeds
- [ ] `README.md` mentions `knowledge` commands and MCP integration
- [ ] `CHANGELOG.md` has `[2.0.0]` as the first entry
- [ ] `docs/index.html` has the `#knowledge` section and nav link
- [ ] `DOTAI.md` template (in `scaffold.ts`) has the knowledge base section and
      updated commands table
