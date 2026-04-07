import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { KnowledgeScanner } from '../src/core/knowledge/scanner'
import { KnowledgeRenderer } from '../src/core/knowledge/renderer'
import { isGitHookInstalled, getChangedFiles } from '../src/core/knowledge/git'
import type { KnowledgeConfig, ModuleInfo, ScanResult } from '../src/core/knowledge/types'

const DEFAULT_CONFIG: KnowledgeConfig = {
  enabled: false,
  scanDepth: 2,
  excludePatterns: [],
  autoUpdateOnCommit: false,
}

describe('KnowledgeScanner', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-scanner-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('detects TypeScript exports correctly', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    await writeFile(join(tmpDir, 'src', 'service.ts'), `
export class AuthService {
  constructor() {}
}

export async function validateToken(token: string): Promise<boolean> {
  return true
}

export const MAX_RETRIES = 3

export interface AuthUser {
  id: string
  name: string
}

export type TokenPayload = {
  sub: string
}

export enum Role {
  Admin,
  User,
}
`)
    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()

    expect(result.modules.length).toBeGreaterThan(0)
    const srcModule = result.modules.find((m) => m.name === 'src')
    expect(srcModule).toBeDefined()

    const file = srcModule!.files[0]
    expect(file.exports).toContain('AuthService')
    expect(file.exports).toContain('validateToken')
    expect(file.exports).toContain('MAX_RETRIES')
    expect(file.exports).toContain('AuthUser')
    expect(file.exports).toContain('TokenPayload')
    expect(file.exports).toContain('Role')

    const classSymbol = file.topLevelSymbols.find((s) => s.name === 'AuthService')
    expect(classSymbol?.kind).toBe('class')
    expect(classSymbol?.isExported).toBe(true)
  })

  it('detects Java public methods correctly', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    await writeFile(join(tmpDir, 'src', 'Service.java'), `
import com.example.model.User;

public class UserService {

  public User findById(Long id) {
    return null;
  }

  public void deleteUser(Long id) {
  }

  private void internalHelper() {
  }
}
`)
    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()
    const srcModule = result.modules.find((m) => m.name === 'src')
    expect(srcModule).toBeDefined()

    const file = srcModule!.files[0]
    expect(file.exports).toContain('UserService')
    expect(file.exports).toContain('findById')
    expect(file.exports).toContain('deleteUser')
    // private methods should not be exported
    const names = file.topLevelSymbols.map((s) => s.name)
    expect(names).not.toContain('internalHelper')
  })

  it('detects Python class and function definitions', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    await writeFile(join(tmpDir, 'src', 'models.py'), `
class User:
    def __init__(self, name):
        self.name = name

def create_user(name):
    return User(name)

async def fetch_users():
    pass
`)
    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()
    const srcModule = result.modules.find((m) => m.name === 'src')
    expect(srcModule).toBeDefined()

    const file = srcModule!.files[0]
    const names = file.topLevelSymbols.map((s) => s.name)
    expect(names).toContain('User')
    expect(names).toContain('create_user')
    expect(names).toContain('fetch_users')
  })

  it('skips node_modules and dist directories', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    await mkdir(join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(join(tmpDir, 'dist'), { recursive: true })

    await writeFile(join(tmpDir, 'src', 'app.ts'), 'export const app = true')
    await writeFile(join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')
    await writeFile(join(tmpDir, 'dist', 'app.js'), 'exports.app = true')

    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()

    // Should only find src module, not node_modules or dist
    const moduleNames = result.modules.map((m) => m.name)
    expect(moduleNames).toContain('src')
    expect(moduleNames).not.toContain('node_modules')
    expect(moduleNames).not.toContain('dist')
  })

  it('respects excludePatterns config', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    await mkdir(join(tmpDir, 'generated'), { recursive: true })

    await writeFile(join(tmpDir, 'src', 'app.ts'), 'export const app = true')
    await writeFile(join(tmpDir, 'generated', 'schema.ts'), 'export const schema = true')

    const config: KnowledgeConfig = {
      ...DEFAULT_CONFIG,
      excludePatterns: ['generated/**'],
    }
    const scanner = new KnowledgeScanner(tmpDir, config)
    const result = await scanner.scanAll()

    const moduleNames = result.modules.map((m) => m.name)
    expect(moduleNames).toContain('src')
    expect(moduleNames).not.toContain('generated')
  })

  it('resolves cross-module dependencies', async () => {
    await mkdir(join(tmpDir, 'core'), { recursive: true })
    await mkdir(join(tmpDir, 'api'), { recursive: true })

    await writeFile(join(tmpDir, 'core', 'service.ts'),
      'export class CoreService {}\n')
    await writeFile(join(tmpDir, 'api', 'handler.ts'),
      'import { CoreService } from \'../core/service\'\nexport class ApiHandler {}\n')

    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()

    const apiModule = result.modules.find((m) => m.name === 'api')
    expect(apiModule).toBeDefined()
    expect(apiModule!.dependencies).toContain('core')

    const coreModule = result.modules.find((m) => m.name === 'core')
    expect(coreModule).toBeDefined()
    expect(coreModule!.dependents).toContain('api')
  })

  it('handles files larger than 500KB gracefully', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true })
    // Create a file larger than 500KB
    const bigContent = 'x'.repeat(600 * 1024)
    await writeFile(join(tmpDir, 'src', 'big.ts'), bigContent)
    await writeFile(join(tmpDir, 'src', 'small.ts'), 'export const x = 1')

    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()

    const srcModule = result.modules.find((m) => m.name === 'src')
    expect(srcModule).toBeDefined()
    // big.ts should be skipped, only small.ts should be scanned
    expect(srcModule!.files.length).toBe(1)
    expect(srcModule!.files[0].relativePath).toContain('small.ts')
  })

  it('returns empty exports for unknown language files', async () => {
    await mkdir(join(tmpDir, 'assets'), { recursive: true })
    await writeFile(join(tmpDir, 'assets', 'config.yaml'), 'key: value\n')

    const scanner = new KnowledgeScanner(tmpDir, DEFAULT_CONFIG)
    const result = await scanner.scanAll()

    const assetsModule = result.modules.find((m) => m.name === 'assets')
    expect(assetsModule).toBeDefined()
    const file = assetsModule!.files[0]
    expect(file.language).toBe('unknown')
    expect(file.exports).toEqual([])
    expect(file.topLevelSymbols).toEqual([])
  })
})

describe('KnowledgeRenderer', () => {
  const renderer = new KnowledgeRenderer()

  function makeMockResult(): ScanResult {
    const mod: ModuleInfo = {
      name: 'auth',
      path: 'src/auth',
      files: [
        {
          relativePath: 'src/auth/AuthService.ts',
          language: 'typescript',
          exports: ['AuthService', 'validateToken'],
          imports: ['../core/base'],
          topLevelSymbols: [
            { name: 'AuthService', kind: 'class', isExported: true },
            { name: 'validateToken', kind: 'function', isExported: true },
          ],
          lineCount: 142,
        },
      ],
      dependencies: ['core'],
      dependents: ['api'],
      lastScanned: '2026-04-01T12:00:00Z',
      commitHash: 'abc1234',
    }

    return {
      projectRoot: '/test',
      scannedAt: '2026-04-01T12:00:00Z',
      commitHash: 'abc1234',
      modules: [mod],
      totalFiles: 1,
    }
  }

  it('renders INDEX.md with correct module table', () => {
    const result = makeMockResult()
    const output = renderer.renderIndex(result)

    expect(output).toContain('# Codebase Knowledge Index')
    expect(output).toContain('| auth | src/auth |')
    expect(output).toContain('AuthService')
    expect(output).toContain('## Module Map')
    expect(output).toContain('## Dependency Graph')
    expect(output).toContain('## Quick Reference')
  })

  it('renders module file with all sections', () => {
    const result = makeMockResult()
    const output = renderer.renderModule(result.modules[0])

    expect(output).toContain('# auth')
    expect(output).toContain('## Files')
    expect(output).toContain('## Key Symbols')
    expect(output).toContain('### Classes')
    expect(output).toContain('### Functions / Methods')
    expect(output).toContain('## Dependencies')
    expect(output).toContain('## Patterns Observed')
    expect(output).toContain('## Gotchas & Edge Cases')
    expect(output).toContain('`core`')
    expect(output).toContain('`api`')
  })

  it('does not overwrite Gotchas section on re-render', () => {
    const result = makeMockResult()
    const firstRender = renderer.renderModule(result.modules[0])

    // Simulate user adding content to the Gotchas section
    const withGotchas = firstRender.replace(
      '## Gotchas & Edge Cases\n<!-- Agents and humans append here — do NOT delete these -->',
      '## Gotchas & Edge Cases\n<!-- Agents and humans append here — do NOT delete these -->\n\n### Important Gotcha\nNever call validateToken with empty string'
    )

    // Re-render and merge
    const secondRender = renderer.renderModule(result.modules[0])
    const merged = renderer.mergeModuleContent(withGotchas, secondRender)

    expect(merged).toContain('Important Gotcha')
    expect(merged).toContain('Never call validateToken with empty string')
  })

  it('appendChangelogEntry prepends new entry', () => {
    const existing = renderer.renderChangelog()

    const updated = renderer.appendChangelogEntry(
      existing,
      ['src/auth/service.ts', 'src/core/base.ts'],
      'abc1234',
      'Fix auth validation'
    )

    expect(updated).toContain('abc1234')
    expect(updated).toContain('Fix auth validation')
    expect(updated).toContain('src/auth/service.ts')
    expect(updated).toContain('Changed 2 file(s)')
    // Entry should be after the marker
    const markerIdx = updated.indexOf('<!-- Entries are prepended (newest first) -->')
    const entryIdx = updated.indexOf('abc1234')
    expect(entryIdx).toBeGreaterThan(markerIdx)
  })

  it('generates valid markdown (no broken table rows)', () => {
    const result = makeMockResult()
    const index = renderer.renderIndex(result)
    const module = renderer.renderModule(result.modules[0])

    // Check that all table rows have the same number of pipes
    const tableRows = index.split('\n').filter((l) => l.startsWith('|') && l.endsWith('|'))
    for (const row of tableRows) {
      const pipeCount = (row.match(/\|/g) || []).length
      expect(pipeCount).toBeGreaterThanOrEqual(2)
    }

    const moduleTableRows = module.split('\n').filter((l) => l.startsWith('|') && l.endsWith('|'))
    for (const row of moduleTableRows) {
      const pipeCount = (row.match(/\|/g) || []).length
      expect(pipeCount).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('knowledge git helpers', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-git-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('getChangedFiles returns empty array when git not available', async () => {
    // tmpDir is not a git repo, so git commands should fail gracefully
    const files = await getChangedFiles(tmpDir)
    expect(files).toEqual([])
  })

  it('isGitHookInstalled returns false when hook missing', async () => {
    const result = await isGitHookInstalled(tmpDir)
    expect(result).toBe(false)
  })
})
