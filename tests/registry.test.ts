import { describe, it, expect } from 'vitest'
import {
  getToolById,
  getAllToolIds,
  isValidToolId,
  getToolChoices,
  getGitignoreEntries,
  TOOL_REGISTRY,
} from '../src/core/registry'

describe('registry', () => {
  describe('TOOL_REGISTRY', () => {
    it('contains all 7 tools', () => {
      expect(TOOL_REGISTRY).toHaveLength(7)
    })

    it('has correct tool IDs', () => {
      const ids = TOOL_REGISTRY.map((t) => t.id)
      expect(ids).toContain('claude')
      expect(ids).toContain('gemini')
      expect(ids).toContain('cursor')
      expect(ids).toContain('copilot')
      expect(ids).toContain('windsurf')
      expect(ids).toContain('codex')
      expect(ids).toContain('antigravity')
    })

    it('each tool has required fields', () => {
      for (const tool of TOOL_REGISTRY) {
        expect(tool.id).toBeTruthy()
        expect(tool.name).toBeTruthy()
        expect(tool.dirName).toBeTruthy()
        expect(tool.docsUrl).toBeTruthy()
        expect(tool.links).toBeInstanceOf(Array)
        expect(tool.links.length).toBeGreaterThan(0)
        expect(tool.gitignore).toBeInstanceOf(Array)
      }
    })

    it('each tool link has required fields', () => {
      for (const tool of TOOL_REGISTRY) {
        for (const link of tool.links) {
          expect(link.source).toBeTruthy()
          expect(link.target).toBeTruthy()
          expect(link.strategy).toBeDefined()
          expect(typeof link.required).toBe('boolean')
          expect(link.description).toBeTruthy()
        }
      }
    })

    it('claude has correct link mappings', () => {
      const claude = getToolById('claude')!
      expect(claude.links.some((l) => l.source === 'AI.md' && l.target === 'CLAUDE.md')).toBe(true)
      expect(claude.links.some((l) => l.target === '.claude/settings.json')).toBe(true)
    })

    it('gemini has correct link mappings', () => {
      const gemini = getToolById('gemini')!
      expect(gemini.links.some((l) => l.source === 'AI.md' && l.target === 'GEMINI.md')).toBe(true)
      expect(gemini.links.some((l) => l.target === '.geminiignore')).toBe(true)
    })

    it('copilot links to .github/ directory', () => {
      const copilot = getToolById('copilot')!
      expect(copilot.links.some((l) => l.source === 'AI.md' && l.target === '.github/copilot-instructions.md')).toBe(true)
    })

    it('codex has global links', () => {
      const codex = getToolById('codex')!
      expect(codex.globalLinks).toBeDefined()
      expect(codex.globalLinks!.length).toBeGreaterThan(0)
    })

    it('antigravity has workflows and skills links', () => {
      const ag = getToolById('antigravity')!
      expect(ag.links.some((l) => l.source === 'AI.md' && l.target === 'GEMINI.md')).toBe(true)
      expect(ag.links.some((l) => l.target === '.agents/workflows')).toBe(true)
      expect(ag.links.some((l) => l.target === '.agents/skills')).toBe(true)
      expect(ag.links.some((l) => l.target === '.gemini/rules')).toBe(true)
    })
  })

  describe('getToolById', () => {
    it('returns tool for valid ID', () => {
      const tool = getToolById('claude')
      expect(tool).toBeDefined()
      expect(tool!.name).toBe('Claude Code')
    })

    it('returns undefined for invalid ID', () => {
      expect(getToolById('invalid')).toBeUndefined()
    })
  })

  describe('getAllToolIds', () => {
    it('returns all 7 tool IDs', () => {
      const ids = getAllToolIds()
      expect(ids).toHaveLength(7)
    })
  })

  describe('isValidToolId', () => {
    it('returns true for valid IDs', () => {
      expect(isValidToolId('claude')).toBe(true)
      expect(isValidToolId('gemini')).toBe(true)
    })

    it('returns false for invalid IDs', () => {
      expect(isValidToolId('invalid')).toBe(false)
      expect(isValidToolId('')).toBe(false)
    })
  })

  describe('getToolChoices', () => {
    it('returns choices for all tools', () => {
      const choices = getToolChoices()
      expect(choices).toHaveLength(7)
    })

    it('codex is unchecked by default', () => {
      const choices = getToolChoices()
      const codex = choices.find((c) => c.value === 'codex')
      expect(codex!.checked).toBe(false)
    })

    it('claude is checked by default', () => {
      const choices = getToolChoices()
      const claude = choices.find((c) => c.value === 'claude')
      expect(claude!.checked).toBe(true)
    })
  })

  describe('getGitignoreEntries', () => {
    it('returns correct entries for selected tools', () => {
      const entries = getGitignoreEntries(['claude', 'gemini'])
      expect(entries).toContain('.claude/')
      expect(entries).toContain('CLAUDE.md')
      expect(entries).toContain('.gemini/')
      expect(entries).toContain('GEMINI.md')
    })

    it('returns empty for unknown tools', () => {
      const entries = getGitignoreEntries(['invalid'])
      expect(entries).toHaveLength(0)
    })

    it('deduplicates entries', () => {
      // windsurf and codex both have AGENTS.md
      const entries = getGitignoreEntries(['windsurf', 'codex'])
      const agentsCount = entries.filter((e) => e === 'AGENTS.md').length
      expect(agentsCount).toBeLessThanOrEqual(1)
    })
  })
})
