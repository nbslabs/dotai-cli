export interface KnowledgeConfig {
  enabled: boolean
  scanDepth: number           // kept for backward compat with existing configs
  excludePatterns: string[]   // kept for backward compat with existing configs
  autoUpdateOnCommit: boolean // legacy — no longer used (hook removed)
  mcpPort?: number            // if set, serve MCP on this port (else stdio)
}
