<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# src/core
> Auto-generated | Last updated: 2026-04-01T20:54:47.660Z | Commit: ed5b9ca
> Path: `src/core`

## Files
| File | Lines | Key Symbols |
|------|-------|-------------|
| config.ts | 105 | getConfigPath, readConfig, writeConfig, createDefaultConfig, markToolLinked |
| git.ts | 134 | getCurrentCommitHash, getCurrentCommitMessage, getChangedFiles, installGitHook, uninstallGitHook |
| mcp.ts | 552 | KnowledgeMcpServer |
| renderer.ts | 297 | KnowledgeRenderer |
| scanner.ts | 467 | KnowledgeScanner |
| types.ts | 43 | ModuleInfo, FileInfo, SymbolInfo, ScanResult, KnowledgeConfig |
| watcher.ts | 85 | KnowledgeWatcher |
| platform.ts | 52 | isWindows, isMacOS, isLinux, getPlatformName, getDirSymlinkType |
| registry.ts | 309 | getToolById, getAllToolIds, isValidToolId, getToolChoices, getGitignoreEntries |
| scaffold.ts | 755 | collectExistingInstructions, scaffoldAiDir, updateGitignore |
| symlink.ts | 261 | createSymlink, removeSymlink, verifySymlink, isSymlink, getSymlinkTarget |

## Key Symbols

### Classes
- `KnowledgeMcpServer`
- `KnowledgeRenderer`
- `KnowledgeScanner`
- `KnowledgeWatcher`

### Functions / Methods
- `getConfigPath`
- `readConfig`
- `writeConfig`
- `createDefaultConfig`
- `markToolLinked`
- `markToolUnlinked`
- `findProjectRoot`
- `getKnowledgeConfig`
- `getCurrentCommitHash`
- `getCurrentCommitMessage`
- `getChangedFiles`
- `installGitHook`
- `uninstallGitHook`
- `isGitHookInstalled`
- `isWindows`
- `isMacOS`
- `isLinux`
- `getPlatformName`
- `getDirSymlinkType`
- `getFileSymlinkType`
- `getHomeDir`
- `getToolById`
- `getAllToolIds`
- `isValidToolId`
- `getToolChoices`
- `getGitignoreEntries`
- `collectExistingInstructions`
- `scaffoldAiDir`
- `updateGitignore`
- `createSymlink`
- `removeSymlink`
- `verifySymlink`
- `isSymlink`
- `getSymlinkTarget`

### Interfaces / Types
- `ToolLinkState`, `DotAiConfig`, `ModuleInfo`, `FileInfo`, `SymbolInfo`, `ScanResult`, `KnowledgeConfig`, `ToolLink`, `ToolDefinition`, `LinkStrategy`, `SymlinkOptions`, `RemoveOptions`, `SymlinkResult`, `SymlinkStatus`, `SymlinkVerifyStatus`

## Dependencies
- **Imports from**: —
- **Imported by**: `tests`

## Patterns Observed
<!-- dotai auto-detects and humans/agents append here -->

## Gotchas & Edge Cases
<!-- Agents and humans append here — do NOT delete these -->
