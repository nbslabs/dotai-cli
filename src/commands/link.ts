import type { CommandModule } from 'yargs'
import { join } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, markToolLinked } from '../core/config'
import { getToolById, isValidToolId } from '../core/registry'
import { createSymlink } from '../core/symlink'
import { pathExists, ensureDir } from '../utils/fs'

interface LinkArgs {
  tools?: string[]
  'dry-run'?: boolean
  force?: boolean
  backup?: boolean
  'no-backup'?: boolean
}

export const linkCommand: CommandModule<{}, LinkArgs> = {
  command: 'link [tools..]',
  describe: 'Create symlinks for one or all tools',
  builder: (yargs) =>
    yargs
      .positional('tools', {
        type: 'string',
        array: true,
        description: 'Specific tools to link (e.g., claude gemini)',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Show what would be linked without doing it',
      })
      .option('force', {
        alias: 'f',
        type: 'boolean',
        description: 'Overwrite existing files/dirs (backs up first)',
      })
      .option('backup', {
        type: 'boolean',
        description: 'Create .bak copies before overwriting',
        default: true,
      })
      .option('no-backup', {
        type: 'boolean',
        description: 'Skip backup when using --force',
      }),

  handler: async (argv) => {
    try {
      const projectRoot = process.cwd()
      const config = await readConfig(projectRoot)

      if (!config) {
        logger.error('No .dotai.json found. Run `dotai init` first.')
        process.exit(1)
        return
      }

      const dryRun = argv['dry-run'] || false
      const force = argv.force || false
      const backup = argv['no-backup'] ? false : argv.backup !== false

      const toolIds = argv.tools && argv.tools.length > 0 ? argv.tools : config.tools

      // Validate tool IDs
      for (const id of toolIds) {
        if (!isValidToolId(id)) {
          logger.error(`Unknown tool: ${id}. Use \`dotai list --all\` to see available tools.`)
          process.exit(1)
          return
        }
      }

      logger.title('dotai link')
      logger.newline()

      let linkedCount = 0
      let skippedCount = 0
      let errorCount = 0

      for (const toolId of toolIds) {
        const tool = getToolById(toolId)
        if (!tool) continue

        const aiPath = join(projectRoot, config.aiDir)

        for (const link of tool.links) {
          const source = join(aiPath, link.source)
          const target = join(projectRoot, link.target)

          // Only link if source exists or is required
          if (!link.required && !(await pathExists(source))) {
            continue
          }

          // Ensure parent directories exist
          const targetDir = join(target, '..')
          if (!(await pathExists(targetDir))) {
            if (!dryRun) {
              await ensureDir(targetDir)
            }
          }

          const result = await createSymlink(source, target, { force, backup, dryRun })

          switch (result.status) {
            case 'created':
            case 'backed-up-and-created':
              logger.success(`${link.target} → ${config.aiDir}/${link.source}`)
              linkedCount++
              break
            case 'already-linked':
              logger.dim(`${link.target} (already linked)`)
              linkedCount++
              break
            case 'dry-run':
              logger.info(`[DRY RUN] ${link.target} → ${config.aiDir}/${link.source}`)
              linkedCount++
              break
            case 'skipped':
              logger.warn(`${link.target}: ${result.message}`)
              skippedCount++
              break
            case 'error':
              logger.error(`${link.target}: ${result.message}`)
              errorCount++
              break
          }
        }

        if (!dryRun) {
          markToolLinked(config, toolId)
        }
      }

      if (!dryRun) {
        await writeConfig(projectRoot, config)
      }

      logger.newline()
      logger.dim(`${linkedCount} linked  ${skippedCount} skipped  ${errorCount} errors`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Link failed: ${message}`)
      process.exit(1)
    }
  },
}
