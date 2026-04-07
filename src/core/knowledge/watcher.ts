import chokidar, { type FSWatcher } from 'chokidar'
import { join } from 'path'
import type { KnowledgeConfig } from './types'

export class KnowledgeWatcher {
  private watcher: FSWatcher | null = null
  private pendingFiles = new Set<string>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs = 1500

  constructor(
    private projectRoot: string,
    private config: KnowledgeConfig,
    private onChanged: (files: string[]) => Promise<void>
  ) {}

  /**
   * Start watching for file changes.
   */
  start(): void {
    const watchPaths = [join(this.projectRoot, '**')]
    const ignored = [
      '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
      '**/out/**', '**/target/**', '**/.ai/**', '**/.claude/**',
      '**/.gemini/**', '**/.cursor/**', '**/.windsurf/**',
      ...this.config.excludePatterns.map((p) => `**/${p}`),
    ]

    this.watcher = chokidar.watch(watchPaths, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      cwd: this.projectRoot,
    })

    this.watcher.on('change', (filePath: string) => this.handleChange(filePath))
    this.watcher.on('add', (filePath: string) => this.handleChange(filePath))
    this.watcher.on('unlink', (filePath: string) => this.handleChange(filePath))
  }

  /**
   * Stop the watcher.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Handle a single file change event. Debounces to batch rapid saves.
   */
  private handleChange(filePath: string): void {
    this.pendingFiles.add(filePath)

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.flush()
    }, this.debounceMs)
  }

  /**
   * Flush pending changes.
   */
  private flush(): void {
    const files = Array.from(this.pendingFiles)
    this.pendingFiles.clear()
    this.debounceTimer = null

    if (files.length > 0) {
      this.onChanged(files).catch(() => {
        // Silently handle errors in watch mode
      })
    }
  }
}
