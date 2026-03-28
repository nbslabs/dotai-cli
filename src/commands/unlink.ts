import type { CommandModule } from 'yargs'
import { join } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, markToolUnlinked } from '../core/config'
import { getToolById, isValidToolId } from '../core/registry'
import { removeSymlink } from '../core/symlink'

interface UnlinkArgs {
  tools?: string[]
  restore?: boolean
  'no-restore'?: boolean
  'dry-run'?: boolean
}

export const unlinkCommand: CommandModule<{}, UnlinkArgs> = {
  command: 'unlink [tools..]',
  describe: 'Remove symlinks for one or all tools',
  builder: (yargs) =>
    yargs
      .positional('tools', {
        type: 'string',
        array: true,
        description: 'Specific tools to unlink',
      })
      .option('restore', {
        type: 'boolean',
        description: 'Restore .dotai.bak backups after unlinking',
        default: true,
      })
      .option('no-restore', {
        type: 'boolean',
        description: 'Remove symlinks only, do not restore backups',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Show what would be unlinked',
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
      const restore = argv['no-restore'] ? false : argv.restore !== false

      const toolIds = argv.tools && argv.tools.length > 0 ? argv.tools : config.tools

      for (const id of toolIds) {
        if (!isValidToolId(id)) {
          logger.error(`Unknown tool: ${id}`)
          process.exit(1)
          return
        }
      }

      logger.title('dotai unlink')
      logger.newline()

      let unlinkedCount = 0
      let skippedCount = 0

      for (const toolId of toolIds) {
        const tool = getToolById(toolId)
        if (!tool) continue

        for (const link of tool.links) {
          const target = join(projectRoot, link.target)
          const result = await removeSymlink(target, { restore, dryRun })

          switch (result.status) {
            case 'created':
              logger.success(`Unlinked ${link.target}`)
              unlinkedCount++
              break
            case 'dry-run':
              logger.info(`[DRY RUN] Would unlink ${link.target}`)
              unlinkedCount++
              break
            case 'skipped':
              logger.dim(`${link.target} (${result.message})`)
              skippedCount++
              break
            case 'error':
              logger.error(`${link.target}: ${result.message}`)
              break
          }
        }

        if (!dryRun) {
          markToolUnlinked(config, toolId)
        }
      }

      if (!dryRun) {
        await writeConfig(projectRoot, config)
      }

      logger.newline()
      logger.dim(`${unlinkedCount} unlinked  ${skippedCount} skipped`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Unlink failed: ${message}`)
      process.exit(1)
    }
  },
}
