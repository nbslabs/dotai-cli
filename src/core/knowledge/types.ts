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
