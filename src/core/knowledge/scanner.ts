import { readdir, readFile, stat } from 'fs/promises'
import { join, relative, extname, basename } from 'path'
import ignore, { type Ignore } from 'ignore'
import type { KnowledgeConfig, ModuleInfo, FileInfo, SymbolInfo, ScanResult } from './types'
import { getCurrentCommitHash } from './git'
import { pathExists } from '../../utils/fs'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '.ai', '.claude', '.gemini', '.cursor', '.windsurf', '.codex', '.agents',
  '.github', '__pycache__', '.venv', 'venv', '.next', '.nuxt',
])

const SKIP_PATTERNS = ['*.min.js', '*.map', '*.lock', '*.generated.*']

const MAX_FILE_SIZE = 500 * 1024 // 500KB

const LANG_MAP: Record<string, FileInfo['language']> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.java': 'java',
  '.py': 'python',
  '.go': 'go',
}

export class KnowledgeScanner {
  private ig: Ignore
  private config: KnowledgeConfig

  constructor(
    private projectRoot: string,
    config: KnowledgeConfig
  ) {
    this.config = config
    this.ig = ignore()
    // Default skip patterns
    for (const pat of SKIP_PATTERNS) {
      this.ig.add(pat)
    }
    // User exclude patterns
    for (const pat of config.excludePatterns) {
      this.ig.add(pat)
    }
  }

  /**
   * Load .gitignore patterns from the project root.
   */
  async loadGitignore(): Promise<void> {
    const gitignorePath = join(this.projectRoot, '.gitignore')
    if (await pathExists(gitignorePath)) {
      const content = await readFile(gitignorePath, 'utf-8')
      this.ig.add(content)
    }
  }

  /**
   * Entry point: scan the entire project.
   */
  async scanAll(): Promise<ScanResult> {
    await this.loadGitignore()

    const commitHash = await getCurrentCommitHash(this.projectRoot) ?? undefined
    const modulePaths = await this.discoverModules(this.projectRoot, this.config.scanDepth)
    const modules: ModuleInfo[] = []

    for (const modPath of modulePaths) {
      const mod = await this.scanModule(modPath)
      modules.push(mod)
    }

    const resolved = this.resolveDependencies(modules)
    const totalFiles = resolved.reduce((sum, m) => sum + m.files.length, 0)

    return {
      projectRoot: this.projectRoot,
      scannedAt: new Date().toISOString(),
      commitHash,
      modules: resolved,
      totalFiles,
    }
  }

  /**
   * Incremental: only re-scan files changed since last commit.
   */
  async scanChanged(changedFiles: string[]): Promise<ModuleInfo[]> {
    await this.loadGitignore()

    const affectedModules = new Set<string>()
    for (const file of changedFiles) {
      const parts = file.split('/')
      // Use the first directory level as the module name
      if (parts.length > 1) {
        affectedModules.add(parts[0])
      }
    }

    const modules: ModuleInfo[] = []
    for (const modName of affectedModules) {
      const modPath = join(this.projectRoot, modName)
      if (await pathExists(modPath)) {
        const mod = await this.scanModule(modPath)
        modules.push(mod)
      }
    }

    return this.resolveDependencies(modules)
  }

  /**
   * Scan a single directory as a module.
   */
  async scanModule(modulePath: string): Promise<ModuleInfo> {
    const relPath = relative(this.projectRoot, modulePath)
    const name = relPath || basename(this.projectRoot)
    const files = await this.collectFiles(modulePath)
    const commitHash = await getCurrentCommitHash(this.projectRoot) ?? undefined

    return {
      name,
      path: relPath || '.',
      files,
      dependencies: [],
      dependents: [],
      lastScanned: new Date().toISOString(),
      commitHash,
    }
  }

  /**
   * Discover top-level module directories.
   */
  private async discoverModules(root: string, depth: number): Promise<string[]> {
    const modules: string[] = []
    const entries = await readdir(root, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue

      const fullPath = join(root, entry.name)
      const rel = relative(this.projectRoot, fullPath)

      if (this.shouldSkip(rel)) continue

      if (depth > 1) {
        const subModules = await this.discoverModules(fullPath, depth - 1)
        if (subModules.length > 0) {
          modules.push(...subModules)
        } else {
          modules.push(fullPath)
        }
      } else {
        modules.push(fullPath)
      }
    }

    return modules
  }

  /**
   * Recursively collect all scannable files in a directory.
   */
  private async collectFiles(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = []
    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      const relToRoot = relative(this.projectRoot, fullPath)

      if (this.shouldSkip(relToRoot)) continue

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const subFiles = await this.collectFiles(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile()) {
        const fileInfo = await this.scanFile(fullPath)
        if (fileInfo) files.push(fileInfo)
      }
    }

    return files
  }

  /**
   * Scan a single file for symbols and imports.
   */
  private async scanFile(filePath: string): Promise<FileInfo | null> {
    const fileStat = await stat(filePath)
    if (fileStat.size > MAX_FILE_SIZE) return null

    const language = this.detectLanguage(filePath)
    const relPath = relative(this.projectRoot, filePath)
    const content = await readFile(filePath, 'utf-8')
    const lineCount = content.split('\n').length

    const topLevelSymbols = this.extractSymbols(content, language)
    const imports = this.extractImports(content, language)
    const exports = topLevelSymbols
      .filter((s) => s.isExported)
      .map((s) => s.name)

    return {
      relativePath: relPath,
      language,
      exports,
      imports,
      topLevelSymbols,
      lineCount,
    }
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(filePath: string): FileInfo['language'] {
    const ext = extname(filePath).toLowerCase()
    return LANG_MAP[ext] || 'unknown'
  }

  /**
   * Extract symbols using regex (no native AST).
   */
  private extractSymbols(content: string, language: string): SymbolInfo[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractTsJsSymbols(content)
      case 'java':
        return this.extractJavaSymbols(content)
      case 'python':
        return this.extractPythonSymbols(content)
      case 'go':
        return this.extractGoSymbols(content)
      default:
        return []
    }
  }

  private extractTsJsSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = []

    // Exported class
    const classRe = /^export\s+(abstract\s+)?class\s+(\w+)/gm
    let m: RegExpExecArray | null
    while ((m = classRe.exec(content)) !== null) {
      symbols.push({ name: m[2], kind: 'class', isExported: true })
    }

    // Exported function
    const funcRe = /^export\s+(async\s+)?function\s+(\w+)/gm
    while ((m = funcRe.exec(content)) !== null) {
      symbols.push({ name: m[2], kind: 'function', isExported: true })
    }

    // Exported const/arrow
    const constRe = /^export\s+const\s+(\w+)\s*=/gm
    while ((m = constRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'variable', isExported: true })
    }

    // Interface
    const ifaceRe = /^export\s+interface\s+(\w+)/gm
    while ((m = ifaceRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'interface', isExported: true })
    }

    // Type alias
    const typeRe = /^export\s+type\s+(\w+)/gm
    while ((m = typeRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'type', isExported: true })
    }

    // Enum
    const enumRe = /^export\s+enum\s+(\w+)/gm
    while ((m = enumRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'enum', isExported: true })
    }

    return symbols
  }

  private extractJavaSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = []
    let m: RegExpExecArray | null

    // Annotations (capture lines before class/method)
    const annotations: string[] = []
    const annoRe = /@(\w+)/g
    while ((m = annoRe.exec(content)) !== null) {
      annotations.push(m[1])
    }

    // Class
    const classRe = /^public\s+(abstract\s+|final\s+)?class\s+(\w+)/gm
    while ((m = classRe.exec(content)) !== null) {
      symbols.push({
        name: m[2],
        kind: 'class',
        isExported: true,
        decorators: annotations.length > 0 ? [...annotations] : undefined,
      })
    }

    // Interface
    const ifaceRe = /^public\s+interface\s+(\w+)/gm
    while ((m = ifaceRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'interface', isExported: true })
    }

    // Public method
    const methodRe = /^\s+public\s+[\w<>\[\]]+\s+(\w+)\s*\(/gm
    while ((m = methodRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'method', isExported: true })
    }

    return symbols
  }

  private extractPythonSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = []
    let m: RegExpExecArray | null

    // Class
    const classRe = /^class\s+(\w+)/gm
    while ((m = classRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'class', isExported: true })
    }

    // Function (sync and async)
    const funcRe = /^(?:async\s+)?def\s+(\w+)/gm
    while ((m = funcRe.exec(content)) !== null) {
      symbols.push({ name: m[1], kind: 'function', isExported: true })
    }

    return symbols
  }

  private extractGoSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = []
    let m: RegExpExecArray | null

    // Function (including methods)
    const funcRe = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/gm
    while ((m = funcRe.exec(content)) !== null) {
      // Exported Go symbols start with uppercase
      const isExported = m[1][0] === m[1][0].toUpperCase() && m[1][0] !== m[1][0].toLowerCase()
      symbols.push({ name: m[1], kind: 'function', isExported })
    }

    // Struct
    const structRe = /^type\s+(\w+)\s+struct/gm
    while ((m = structRe.exec(content)) !== null) {
      const isExported = m[1][0] === m[1][0].toUpperCase() && m[1][0] !== m[1][0].toLowerCase()
      symbols.push({ name: m[1], kind: 'class', isExported })
    }

    // Interface
    const ifaceRe = /^type\s+(\w+)\s+interface/gm
    while ((m = ifaceRe.exec(content)) !== null) {
      const isExported = m[1][0] === m[1][0].toUpperCase() && m[1][0] !== m[1][0].toLowerCase()
      symbols.push({ name: m[1], kind: 'interface', isExported })
    }

    return symbols
  }

  /**
   * Extract import paths using regex.
   */
  private extractImports(content: string, language: string): string[] {
    const imports: string[] = []
    let m: RegExpExecArray | null

    switch (language) {
      case 'typescript':
      case 'javascript': {
        const re = /^import\s+.*?\s+from\s+['"](.+?)['"]/gm
        while ((m = re.exec(content)) !== null) {
          imports.push(m[1])
        }
        break
      }
      case 'java': {
        const re = /^import\s+([\w.]+);/gm
        while ((m = re.exec(content)) !== null) {
          imports.push(m[1])
        }
        break
      }
      case 'python': {
        const re = /^(?:from\s+(\S+)\s+)?import\s+(.+)/gm
        while ((m = re.exec(content)) !== null) {
          imports.push(m[1] || m[2].trim())
        }
        break
      }
      case 'go': {
        // Go imports: import "pkg" or import ( "pkg1" \n "pkg2" )
        const singleRe = /^import\s+"(.+?)"/gm
        while ((m = singleRe.exec(content)) !== null) {
          imports.push(m[1])
        }
        const blockRe = /import\s*\(([\s\S]*?)\)/gm
        while ((m = blockRe.exec(content)) !== null) {
          const lines = m[1].split('\n')
          for (const line of lines) {
            const pkgMatch = line.match(/^\s*"(.+?)"/)
            if (pkgMatch) imports.push(pkgMatch[1])
          }
        }
        break
      }
    }

    return imports
  }

  /**
   * Resolve cross-module dependencies by comparing import paths to known modules.
   */
  private resolveDependencies(modules: ModuleInfo[]): ModuleInfo[] {
    const moduleNames = new Set(modules.map((m) => m.name))

    for (const mod of modules) {
      const deps = new Set<string>()

      for (const file of mod.files) {
        for (const imp of file.imports) {
          for (const otherName of moduleNames) {
            if (otherName === mod.name) continue
            if (imp.includes(otherName)) {
              deps.add(otherName)
            }
          }
        }
      }

      mod.dependencies = Array.from(deps)
    }

    // Compute dependents (reverse lookup)
    for (const mod of modules) {
      mod.dependents = modules
        .filter((other) => other.dependencies.includes(mod.name))
        .map((other) => other.name)
    }

    return modules
  }

  /**
   * Respect .gitignore and custom excludePatterns.
   */
  private shouldSkip(filePath: string): boolean {
    // Check as file, as directory (trailing slash), and as a child path
    // to catch patterns like 'dir/**' which match children but not the dir itself
    return this.ig.ignores(filePath)
      || this.ig.ignores(filePath + '/')
      || this.ig.ignores(filePath + '/x')
  }
}
