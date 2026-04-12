import type { CommandModule } from 'yargs'
import { join, relative } from 'path'
import { readFile, rm } from 'fs/promises'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot, getKnowledgeConfig } from '../core/config'
import { pathExists, ensureDir, writeTextFile, readTextFile } from '../utils/fs'
import { KnowledgeScanner } from '../core/knowledge/scanner'
import { KnowledgeRenderer } from '../core/knowledge/renderer'
import { KnowledgeWatcher } from '../core/knowledge/watcher'
import { KnowledgeMcpServer } from '../core/knowledge/mcp'
import {
  getCurrentCommitHash,
  getCurrentCommitMessage,
  getChangedFiles,
  installGitHook,
  uninstallGitHook,
  isGitHookInstalled,
} from '../core/knowledge/git'
import type { KnowledgeConfig } from '../core/knowledge/types'
import { VERSION } from '../version'

interface KnowledgeArgs {
  silent?: boolean
}

/**
 * Check that dotai has been initialized (i.e. .dotai.json exists).
 */
async function requireInit(projectRoot: string): Promise<import('../core/config').DotAiConfig> {
  const config = await readConfig(projectRoot)
  if (!config) {
    logger.error('No .dotai.json found. Run `dotai init` first.')
    process.exit(1)
  }
  return config
}

/**
 * Check that the knowledge directory exists, or print actionable error.
 */
async function requireKnowledgeDir(knowledgePath: string): Promise<boolean> {
  if (!(await pathExists(knowledgePath))) {
    logger.error("No knowledge base found. Run 'dotai knowledge scan' first.")
    return false
  }
  return true
}

/**
 * Get the knowledge path for a project.
 */
function getKnowledgePath(projectRoot: string, aiDir: string): string {
  return join(projectRoot, aiDir, 'knowledge')
}

/**
 * Run a full or module-specific scan.
 */
async function runScan(
  projectRoot: string,
  knowledgePath: string,
  config: KnowledgeConfig,
  options: { module?: string; dryRun?: boolean; silent?: boolean }
): Promise<{ moduleCount: number; fileCount: number }> {
  const scanner = new KnowledgeScanner(projectRoot, config)
  const renderer = new KnowledgeRenderer()

  if (options.module) {
    const modPath = join(projectRoot, options.module)
    if (!(await pathExists(modPath))) {
      throw new Error(`Module path not found: ${options.module}`)
    }
    const mod = await scanner.scanModule(modPath)
    const resolved = [mod] // Single module, deps not resolved across project

    if (!options.dryRun) {
      await ensureDir(join(knowledgePath, 'modules'))
      await writeModuleFile(knowledgePath, mod, renderer)
    }

    return { moduleCount: 1, fileCount: mod.files.length }
  }

  const result = await scanner.scanAll()

  if (options.dryRun) {
    if (!options.silent) {
      logger.info('[DRY RUN] Would scan:')
      for (const mod of result.modules) {
        logger.dim(`  ${mod.name} — ${mod.files.length} files`)
      }
    }
    return { moduleCount: result.modules.length, fileCount: result.totalFiles }
  }

  // Ensure directories exist
  await ensureDir(join(knowledgePath, 'modules'))
  await ensureDir(join(knowledgePath, 'decisions'))

  // Write INDEX.md (always overwrite)
  const indexContent = renderer.renderIndex(result)
  await writeTextFile(join(knowledgePath, 'INDEX.md'), indexContent)

  // Write module files (merge if existing)
  for (const mod of result.modules) {
    await writeModuleFile(knowledgePath, mod, renderer)
  }

  // Write skeleton files if they don't exist
  await writeSkeletonIfMissing(join(knowledgePath, 'patterns.md'), renderer.renderPatterns())
  await writeSkeletonIfMissing(join(knowledgePath, 'gotchas.md'), renderer.renderGotchas())
  await writeSkeletonIfMissing(join(knowledgePath, 'changelog.md'), renderer.renderChangelog())

  return { moduleCount: result.modules.length, fileCount: result.totalFiles }
}

/**
 * Write a module file, merging with existing content if present.
 */
async function writeModuleFile(
  knowledgePath: string,
  mod: import('../core/knowledge/types').ModuleInfo,
  renderer: KnowledgeRenderer
): Promise<void> {
  const filePath = join(knowledgePath, 'modules', `${mod.name}.md`)
  const newContent = renderer.renderModule(mod)

  if (await pathExists(filePath)) {
    const existing = await readTextFile(filePath)
    const merged = renderer.mergeModuleContent(existing, newContent)
    await writeTextFile(filePath, merged)
  } else {
    await writeTextFile(filePath, newContent)
  }
}

/**
 * Write a file only if it doesn't already exist.
 */
async function writeSkeletonIfMissing(filePath: string, content: string): Promise<void> {
  if (!(await pathExists(filePath))) {
    await writeTextFile(filePath, content)
  }
}

/**
 * Run incremental update from git diff.
 */
async function runUpdate(
  projectRoot: string,
  knowledgePath: string,
  config: KnowledgeConfig,
  silent: boolean
): Promise<number> {
  const allChangedFiles = await getChangedFiles(projectRoot)

  // Filter out knowledge files — they must never trigger their own re-scan
  const knowledgeRelative = relative(projectRoot, knowledgePath)
  const changedFiles = allChangedFiles.filter(
    (f) => !f.startsWith(knowledgeRelative + '/') && !f.startsWith('.ai/knowledge/')
  )

  if (changedFiles.length === 0) {
    if (!silent) logger.dim('No changed files since last commit')
    return 0
  }

  const scanner = new KnowledgeScanner(projectRoot, config)
  const renderer = new KnowledgeRenderer()

  const modules = await scanner.scanChanged(changedFiles)

  // Update module files
  await ensureDir(join(knowledgePath, 'modules'))
  for (const mod of modules) {
    await writeModuleFile(knowledgePath, mod, renderer)
  }

  // Append to changelog
  // In silent mode (hook), don't record commit hash — it will change after amend.
  // Use commit message for dedup since message is preserved by --no-edit amend.
  const commitMessage = await getCurrentCommitMessage(projectRoot) ?? 'no message'
  const commitHash = silent ? 'hook' : (await getCurrentCommitHash(projectRoot) ?? 'unknown')
  const changelogPath = join(knowledgePath, 'changelog.md')

  if (await pathExists(changelogPath)) {
    const existing = await readTextFile(changelogPath)
    // Dedup by commit message to prevent duplicates from hook re-runs
    if (!existing.includes(commitMessage)) {
      const updated = renderer.appendChangelogEntry(existing, changedFiles, commitHash, commitMessage)
      await writeTextFile(changelogPath, updated)
    }
  }

  // Regenerate INDEX.md
  const result = await scanner.scanAll()
  const indexContent = renderer.renderIndex(result)
  await writeTextFile(join(knowledgePath, 'INDEX.md'), indexContent)

  return modules.length
}

export const knowledgeCommand: CommandModule<{}, KnowledgeArgs> = {
  command: 'knowledge <subcommand>',
  describe: 'Manage persistent codebase knowledge base',
  builder: (yargs) =>
    yargs
      .command(
        'scan [path]',
        'Scan codebase and generate knowledge files',
        (y) =>
          y
            .positional('path', { type: 'string', description: 'Project path (default: cwd)' })
            .option('depth', { type: 'number', description: 'Module depth', alias: 'n' })
            .option('module', { type: 'string', description: 'Scan only this module path' })
            .option('silent', { type: 'boolean', description: 'Suppress output' })
            .option('dry-run', { type: 'boolean', description: 'Preview without writing' }),
        async (argv) => {
          try {
            const silent = argv.silent || false
            const projectRoot = argv.path || (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)

            if (!silent) {
              logger.title(`dotai knowledge scan — v${VERSION}`)
              logger.newline()
            }

            const aiDir = config.aiDir
            const knowledgeConfig: KnowledgeConfig = {
              ...getKnowledgeConfig(config),
              ...(argv.depth ? { scanDepth: argv.depth } : {}),
            }

            const knowledgePath = getKnowledgePath(projectRoot, aiDir)

            const { moduleCount, fileCount } = await runScan(
              projectRoot,
              knowledgePath,
              knowledgeConfig,
              { module: argv.module, dryRun: argv['dry-run'], silent }
            )

            // Mark knowledge as enabled in config
            if (!argv['dry-run'] && config) {
              config.knowledge = { ...knowledgeConfig, enabled: true }
              await writeConfig(projectRoot, config)
            }

            if (!silent) {
              logger.newline()
              logger.success(`Scanned ${fileCount} files across ${moduleCount} modules → .ai/knowledge/`)
              logger.newline()
              logger.info('Next step: Ask your AI agent to deeply populate the knowledge base.')
              logger.info('Example prompt for your agent:')
              logger.newline()
              logger.info('  "Use knowledge_explore to analyze the codebase, then use')
              logger.info('   knowledge_append and knowledge_populate_ai_md to populate')
              logger.info('   the knowledge base with architecture, patterns, and gotchas."')
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge scan failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'update',
        'Incremental update from last git commit',
        (y) => y.option('silent', { type: 'boolean', description: 'Suppress output' }),
        async (argv) => {
          try {
            const silent = argv.silent || false
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const knowledgePath = getKnowledgePath(projectRoot, config.aiDir)

            if (!(await requireKnowledgeDir(knowledgePath))) {
              process.exit(1)
            }

            const knowledgeConfig = getKnowledgeConfig(config)
            const count = await runUpdate(projectRoot, knowledgePath, knowledgeConfig, silent)

            if (!silent) {
              logger.success(`Updated ${count} module(s)`)
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge update failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'watch',
        'Watch files and auto-update knowledge on save',
        (y) => y.option('silent', { type: 'boolean', description: 'Suppress startup banner' }),
        async (argv) => {
          try {
            const silent = argv.silent || false
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const knowledgePath = getKnowledgePath(projectRoot, config.aiDir)

            if (!(await requireKnowledgeDir(knowledgePath))) {
              process.exit(1)
            }

            const knowledgeConfig = getKnowledgeConfig(config)

            if (!silent) {
              logger.info('Watching for changes... (Ctrl+C to stop)')
            }

            const watcher = new KnowledgeWatcher(
              projectRoot,
              knowledgeConfig,
              async (files) => {
                const scanner = new KnowledgeScanner(projectRoot, knowledgeConfig)
                const renderer = new KnowledgeRenderer()
                const modules = await scanner.scanChanged(files)

                await ensureDir(join(knowledgePath, 'modules'))
                for (const mod of modules) {
                  await writeModuleFile(knowledgePath, mod, renderer)
                }

                // Regenerate INDEX
                const result = await scanner.scanAll()
                await writeTextFile(join(knowledgePath, 'INDEX.md'), renderer.renderIndex(result))

                if (!silent) {
                  logger.success(`Updated ${modules.length} module(s)`)
                }
              }
            )

            watcher.start()

            // Keep process alive
            process.on('SIGINT', () => {
              watcher.stop()
              process.exit(0)
            })
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge watch failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'serve',
        'Start MCP server for agent tool access',
        (y) =>
          y
            .option('stdio', { type: 'boolean', description: 'Use stdio transport (default)', default: true })
            .option('port', { type: 'number', description: 'HTTP SSE port (not yet implemented)' })
            .option('project', { type: 'string', description: 'Explicit project root path (for IDE-spawned MCP where cwd may differ)' }),
        async (argv) => {
          try {
            // IDE tools (Antigravity) may spawn MCP with a different cwd.
            // --project lets the config explicitly pass the project root.
            const projectRoot = argv.project || (await findProjectRoot()) || process.cwd()

            process.stderr.write(`dotai MCP: project root = ${projectRoot}\n`)

            // IMPORTANT: serve command must NEVER use logger (console.log -> stdout).
            // stdout is reserved for JSON-RPC. All messages go to stderr.

            // MCP server runs independently — no .dotai.json required.
            // Use config if available, otherwise fall back to defaults.
            const config = await readConfig(projectRoot)
            const aiDir = config?.aiDir || '.ai'
            const knowledgePath = getKnowledgePath(projectRoot, aiDir)

            // Auto-create knowledge directory if it doesn't exist
            if (!(await pathExists(knowledgePath))) {
              await ensureDir(knowledgePath)
              process.stderr.write(`dotai MCP: created ${knowledgePath}\n`)
            }

            if (argv.port) {
              process.stderr.write('HTTP SSE transport is not yet implemented. Use --stdio.\n')
              process.exit(1)
            }

            process.stderr.write('dotai knowledge MCP server running (stdio)\n')

            const server = new KnowledgeMcpServer(knowledgePath, projectRoot, aiDir)
            await server.start()
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            process.stderr.write(`Knowledge serve failed: ${message}\n`)
            process.exit(1)
          }
        }
      )
      .command(
        'hook <action>',
        'Manage git post-commit hook',
        (y) =>
          y.positional('action', {
            type: 'string',
            choices: ['install', 'uninstall', 'status'] as const,
            description: 'Hook action',
            demandOption: true,
          }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            await requireInit(projectRoot)
            logger.title('dotai knowledge hook')
            logger.newline()

            switch (argv.action) {
              case 'install':
                await installGitHook(projectRoot)
                logger.success('Git post-commit hook installed')
                logger.dim('Knowledge will auto-update after each commit')
                break
              case 'uninstall':
                await uninstallGitHook(projectRoot)
                logger.success('Git post-commit hook removed')
                break
              case 'status': {
                const installed = await isGitHookInstalled(projectRoot)
                if (installed) {
                  logger.success('Git hook is installed')
                } else {
                  logger.dim('Git hook is not installed')
                  logger.dim('Run: dotai knowledge hook install')
                }
                break
              }
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Hook operation failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'status',
        'Show knowledge base health',
        (y) => y,
        async () => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const knowledgePath = getKnowledgePath(projectRoot, config.aiDir)

            logger.title('dotai knowledge status')
            logger.newline()

            // Check if knowledge dir exists
            const exists = await pathExists(knowledgePath)
            if (!exists) {
              logger.warn('Knowledge directory does not exist')
              logger.dim("Run 'dotai knowledge scan' to create it")
              return
            }
            logger.success('Knowledge directory exists')

            // Count modules
            const modulesDir = join(knowledgePath, 'modules')
            let moduleCount = 0
            if (await pathExists(modulesDir)) {
              const { readdir } = await import('fs/promises')
              const entries = await readdir(modulesDir)
              moduleCount = entries.filter((e) => e.endsWith('.md')).length
            }
            logger.info(`${moduleCount} module(s) indexed`)

            // Check last scan time from INDEX.md header
            const indexPath = join(knowledgePath, 'INDEX.md')
            if (await pathExists(indexPath)) {
              const content = await readTextFile(indexPath)
              const match = content.match(/Last scanned: (.+?) \|/)
              if (match) {
                const scanDate = new Date(match[1])
                const daysSince = Math.floor((Date.now() - scanDate.getTime()) / (1000 * 60 * 60 * 24))
                logger.dim(`Last scanned: ${match[1]}`)
                if (daysSince > 7) {
                  logger.warn(`Knowledge is ${daysSince} days stale — consider running 'dotai knowledge scan'`)
                }
              }
            }

            // Check git hook
            const hookInstalled = await isGitHookInstalled(projectRoot)
            if (hookInstalled) {
              logger.success('Git post-commit hook is installed')
            } else {
              logger.dim('Git post-commit hook is not installed')
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge status failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'clean',
        'Delete knowledge base for fresh re-scan',
        (y) => y.option('yes', { type: 'boolean', description: 'Skip confirmation', alias: 'y' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const knowledgePath = getKnowledgePath(projectRoot, config.aiDir)

            if (!(await pathExists(knowledgePath))) {
              logger.dim('No knowledge directory to clean')
              return
            }

            if (!argv.yes) {
              const { promptConfirm } = await import('../utils/prompt')
              const proceed = await promptConfirm('Delete .ai/knowledge/ entirely?', false)
              if (!proceed) {
                logger.dim('Aborted.')
                return
              }
            }

            await rm(knowledgePath, { recursive: true, force: true })
            logger.success('Knowledge base deleted. Run `dotai knowledge scan` to rebuild.')

            // Update config
            if (config?.knowledge) {
              config.knowledge.enabled = false
              await writeConfig(projectRoot, config)
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge clean failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .command(
        'append',
        'Add a finding to gotchas, patterns, or a module',
        (y) =>
          y
            .option('module', { type: 'string', description: 'Target module file' })
            .option('gotchas', { type: 'boolean', description: 'Append to gotchas.md' })
            .option('patterns', { type: 'boolean', description: 'Append to patterns.md' })
            .option('finding', { type: 'string', description: 'The finding to append', demandOption: true })
            .option('agent', { type: 'string', description: 'Who discovered this', default: 'human' })
            .check((argv) => {
              if (!argv.module && !argv.gotchas && !argv.patterns) {
                throw new Error('Specify --module <name>, --gotchas, or --patterns')
              }
              return true
            }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const knowledgePath = getKnowledgePath(projectRoot, config.aiDir)

            if (!(await requireKnowledgeDir(knowledgePath))) {
              process.exit(1)
            }

            const timestamp = new Date().toISOString()
            const entry = `\n### ${timestamp} — by ${argv.agent}\n${argv.finding}\n`

            let targetPath: string
            let targetName: string

            if (argv.gotchas) {
              targetPath = join(knowledgePath, 'gotchas.md')
              targetName = 'gotchas.md'
            } else if (argv.patterns) {
              targetPath = join(knowledgePath, 'patterns.md')
              targetName = 'patterns.md'
            } else {
              targetPath = join(knowledgePath, 'modules', `${argv.module}.md`)
              targetName = `modules/${argv.module}.md`

              if (!(await pathExists(targetPath))) {
                logger.error(`Module file not found: ${targetName}`)
                logger.dim('Available modules are listed in INDEX.md')
                process.exit(1)
              }
            }

            if (!(await pathExists(targetPath))) {
              logger.error(`File not found: ${targetName}`)
              process.exit(1)
            }

            const existing = await readTextFile(targetPath)
            await writeTextFile(targetPath, existing + entry)

            logger.success(`Appended finding to ${targetName}`)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge append failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai knowledge --help` for usage.')
      .strict(),

  handler: async () => {
    // Subcommands handle everything
  },
}
