import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readConfig, writeConfig, createDefaultConfig, findProjectRoot, markToolLinked, markToolUnlinked } from '../src/core/config'
import { pathExists } from '../src/utils/fs'
import { VERSION } from '../src/version'

describe('config', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-config-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('createDefaultConfig', () => {
    it('creates config with specified tools', () => {
      const config = createDefaultConfig(['claude', 'gemini'])
      expect(config.version).toBe(VERSION)
      expect(config.tools).toEqual(['claude', 'gemini'])
      expect(config.aiDir).toBe('.ai')
      expect(config.links.claude).toEqual({ linked: false })
      expect(config.links.gemini).toEqual({ linked: false })
    })

    it('uses custom aiDir', () => {
      const config = createDefaultConfig(['claude'], '.custom-ai')
      expect(config.aiDir).toBe('.custom-ai')
    })
  })

  describe('writeConfig / readConfig', () => {
    it('writes and reads config', async () => {
      const config = createDefaultConfig(['claude'])
      await writeConfig(tmpDir, config)

      const read = await readConfig(tmpDir)
      expect(read).toBeDefined()
      expect(read!.tools).toEqual(['claude'])
    })

    it('returns null for missing config', async () => {
      const read = await readConfig(tmpDir)
      expect(read).toBeNull()
    })
  })

  describe('markToolLinked / markToolUnlinked', () => {
    it('marks tool as linked with timestamp', () => {
      const config = createDefaultConfig(['claude'])
      markToolLinked(config, 'claude')
      expect(config.links.claude.linked).toBe(true)
      expect(config.links.claude.linkedAt).toBeDefined()
    })

    it('marks tool as unlinked', () => {
      const config = createDefaultConfig(['claude'])
      markToolLinked(config, 'claude')
      markToolUnlinked(config, 'claude')
      expect(config.links.claude.linked).toBe(false)
      expect(config.links.claude.linkedAt).toBeUndefined()
    })
  })

  describe('findProjectRoot', () => {
    it('finds directory with .dotai.json', async () => {
      await writeFile(join(tmpDir, '.dotai.json'), '{}')
      const root = await findProjectRoot(tmpDir)
      expect(root).toBe(tmpDir)
    })

    it('finds directory with .git', async () => {
      const { mkdir } = await import('fs/promises')
      await mkdir(join(tmpDir, '.git'))
      const root = await findProjectRoot(tmpDir)
      expect(root).toBe(tmpDir)
    })
  })
})
