import type { CommandModule } from 'yargs'
import { join } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, markToolLinked, markToolUnlinked } from '../core/config'
import { getToolById, isValidToolId } from '../core/registry'
import { createSymlink, removeSymlink, verifySymlink } from '../core/symlink'
import { pathExists } from '../utils/fs'

interface SyncArgs {
  tools?: string
  'dry-run'?: boolean
}

export const syncCommand: CommandModule<{}, SyncArgs> = {
  command: 'sync',
  describe: 'Re-evaluate and repair all symlinks',
  builder: (yargs) =>
    yargs
      .option('tools', {
        type: 'string',
        description: 'Sync specific tools only (comma-separated)',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Show what would change',
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
      const toolIds = argv.tools
        ? argv.tools.split(',').map((t) => t.trim())
        : config.tools

      logger.title('dotai sync')
      logger.newline()

      let fixed = 0
      let removed = 0
      let unchanged = 0

      for (const toolId of toolIds) {
        if (!isValidToolId(toolId)) {
          logger.warn(`Unknown tool: ${toolId}, skipping`)
          continue
        }

        const tool = getToolById(toolId)!
        const aiPath = join(projectRoot, config.aiDir)
        const isConfigured = config.tools.includes(toolId)

        if (!isConfigured) {
          // Tool not in config — remove stale symlinks
          for (const link of tool.links) {
            const target = join(projectRoot, link.target)
            const status = await verifySymlink(target, join(aiPath, link.source))
            if (status.status === 'valid') {
              if (dryRun) {
                logger.info(`[DRY RUN] Would remove stale link: ${link.target}`)
              } else {
                await removeSymlink(target)
                logger.success(`Removed stale link: ${link.target}`)
              }
              removed++
            }
          }
          continue
        }

        // Tool is configured — verify and fix links
        let toolHasLinks = false
        for (const link of tool.links) {
          const source = join(aiPath, link.source)
          const target = join(projectRoot, link.target)

          // Skip if source doesn't exist and not required
          if (!link.required && !(await pathExists(source))) {
            continue
          }

          const status = await verifySymlink(target, source)

          switch (status.status) {
            case 'valid':
              unchanged++
              break
            case 'missing':
            case 'broken':
            case 'wrong-target':
              if (dryRun) {
                logger.info(`[DRY RUN] Would fix: ${link.target} → ${config.aiDir}/${link.source}`)
              } else {
                // Remove existing broken/wrong symlink first
                if (status.status !== 'missing') {
                  await removeSymlink(target, { restore: false })
                }
                const result = await createSymlink(source, target, { force: true })
                if (result.status === 'created' || result.status === 'backed-up-and-created') {
                  logger.success(`Fixed: ${link.target} → ${config.aiDir}/${link.source}`)
                }
              }
              fixed++
              toolHasLinks = true
              break
            case 'not-symlink':
              logger.warn(`${link.target} is a real file, not a symlink. Use \`dotai link --force\` to replace.`)
              break
          }

          if (status.status === 'valid') {
            toolHasLinks = true
          }
        }

        if (!dryRun && toolHasLinks) {
          markToolLinked(config, toolId)
        }
      }

      if (!dryRun) {
        await writeConfig(projectRoot, config)
      }

      logger.newline()
      logger.dim(`${fixed} fixed  ${removed} removed  ${unchanged} unchanged`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Sync failed: ${message}`)
      process.exit(1)
    }
  },
}
