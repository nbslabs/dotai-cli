import { describe, it, expect } from 'vitest'
import type { KnowledgeConfig } from '../src/core/knowledge/types'

describe('KnowledgeConfig types', () => {
  it('has all required fields', () => {
    const config: KnowledgeConfig = {
      enabled: false,
      scanDepth: 2,
      excludePatterns: [],
      autoUpdateOnCommit: false,
    }

    expect(config.enabled).toBe(false)
    expect(config.scanDepth).toBe(2)
    expect(config.excludePatterns).toEqual([])
    expect(config.autoUpdateOnCommit).toBe(false)
  })

  it('supports optional mcpPort', () => {
    const config: KnowledgeConfig = {
      enabled: true,
      scanDepth: 3,
      excludePatterns: ['dist/**'],
      autoUpdateOnCommit: false,
      mcpPort: 8080,
    }

    expect(config.mcpPort).toBe(8080)
  })
})
