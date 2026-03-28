import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { scaffoldAiDir, updateGitignore } from '../src/core/scaffold'
import { pathExists } from '../src/utils/fs'

describe('scaffold', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-scaffold-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('scaffoldAiDir', () => {
    it('creates .ai/ directory structure', async () => {
      await scaffoldAiDir(tmpDir, {
        projectName: 'TestProject',
        projectDescription: 'A test project',
        aiDir: '.ai',
        tools: ['claude', 'gemini'],
      })

      const aiPath = join(tmpDir, '.ai')
      expect(await pathExists(aiPath)).toBe(true)
      expect(await pathExists(join(aiPath, 'AI.md'))).toBe(true)


      expect(await pathExists(join(aiPath, 'rules', 'general.md'))).toBe(true)
      expect(await pathExists(join(aiPath, 'rules', 'security.md'))).toBe(true)
    })

    it('substitutes project name in templates', async () => {
      await scaffoldAiDir(tmpDir, {
        projectName: 'MyApp',
        projectDescription: 'My awesome app',
        aiDir: '.ai',
        tools: ['claude'],
      })

      const content = await readFile(join(tmpDir, '.ai', 'AI.md'), 'utf-8')
      expect(content).toContain('MyApp')
      expect(content).toContain('My awesome app')
    })

    it('only creates tool-specific files for enabled tools', async () => {
      await scaffoldAiDir(tmpDir, {
        projectName: 'TestProject',
        projectDescription: '',
        aiDir: '.ai',
        tools: ['claude'],
      })

      expect(await pathExists(join(tmpDir, '.ai', 'AI.md'))).toBe(true)

    })

    it('does not overwrite existing files', async () => {
      // First scaffolding
      await scaffoldAiDir(tmpDir, {
        projectName: 'First',
        projectDescription: '',
        aiDir: '.ai',
        tools: ['claude'],
      })

      // Second scaffolding
      await scaffoldAiDir(tmpDir, {
        projectName: 'Second',
        projectDescription: '',
        aiDir: '.ai',
        tools: ['claude'],
      })

      const content = await readFile(join(tmpDir, '.ai', 'AI.md'), 'utf-8')
      expect(content).toContain('First')
    })

    it('creates all subdirectories', async () => {
      await scaffoldAiDir(tmpDir, {
        projectName: 'TestProject',
        projectDescription: '',
        aiDir: '.ai',
        tools: ['claude', 'gemini', 'copilot', 'windsurf'],
      })

      expect(await pathExists(join(tmpDir, '.ai', 'rules'))).toBe(true)
      expect(await pathExists(join(tmpDir, '.ai', 'commands'))).toBe(true)
      expect(await pathExists(join(tmpDir, '.ai', 'skills'))).toBe(true)
      expect(await pathExists(join(tmpDir, '.ai', 'settings'))).toBe(true)
      expect(await pathExists(join(tmpDir, '.ai', 'ignore'))).toBe(true)
    })

    it('returns list of created files', async () => {
      const files = await scaffoldAiDir(tmpDir, {
        projectName: 'TestProject',
        projectDescription: '',
        aiDir: '.ai',
        tools: ['claude'],
      })

      expect(files.length).toBeGreaterThan(0)
      expect(files.some((f) => f.includes('AI.md'))).toBe(true)
    })
  })

  describe('updateGitignore', () => {
    it('creates .gitignore if not exists', async () => {
      const count = await updateGitignore(tmpDir, ['.claude/', 'CLAUDE.md'])
      expect(count).toBe(2)

      const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8')
      expect(content).toContain('.claude/')
      expect(content).toContain('CLAUDE.md')
    })

    it('appends to existing .gitignore', async () => {
      const { writeFile } = await import('fs/promises')
      await writeFile(join(tmpDir, '.gitignore'), 'node_modules/\n')

      const count = await updateGitignore(tmpDir, ['.claude/'])
      expect(count).toBe(1)

      const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.claude/')
    })

    it('does not duplicate entries', async () => {
      const { writeFile } = await import('fs/promises')
      await writeFile(join(tmpDir, '.gitignore'), '.claude/\n')

      const count = await updateGitignore(tmpDir, ['.claude/'])
      expect(count).toBe(0)
    })

    it('returns 0 for empty entries', async () => {
      const count = await updateGitignore(tmpDir, [])
      expect(count).toBe(0)
    })
  })
})
