import type { CommandModule } from 'yargs'
import { join } from 'path'
import { rm } from 'fs/promises'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, markToolUnlinked } from '../core/config'
import { getToolById, isValidToolId } from '../core/registry'
import { removeSymlink } from '../core/symlink'
import { promptConfirm } from '../utils/prompt'
import { pathExists } from '../utils/fs'

interface RemoveArgs {
  tool: string
  'keep-files'?: boolean
  purge?: boolean
}

export const removeCommand: CommandModule<{}, RemoveArgs> = {
  command: 'remove <tool>',
  describe: 'Remove a tool from the project config and clean up symlinks',
  builder: (yargs) =>
    yargs
      .positional('tool', {
        type: 'string',
        description: 'Tool ID to remove',
        demandOption: true,
      })
      .option('keep-files', {
        type: 'boolean',
        description: 'Remove from config only, leave symlinks in place',
      })
      .option('purge', {
        type: 'boolean',
        description: 'Also delete generated source files from .ai/ (destructive)',
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

      const toolId = argv.tool

      if (!isValidToolId(toolId)) {
        logger.error(`Unknown tool: ${toolId}`)
        process.exit(1)
        return
      }

      if (!config.tools.includes(toolId)) {
        logger.warn(`Tool '${toolId}' is not configured in this project.`)
        return
      }

      const tool = getToolById(toolId)!

      logger.title(`dotai remove ${toolId}`)
      logger.newline()

      // Remove symlinks unless --keep-files
      if (!argv['keep-files']) {
        logger.plain(`Unlinking ${tool.name}...`)
        for (const link of tool.links) {
          const target = join(projectRoot, link.target)
          const result = await removeSymlink(target)
          if (result.status === 'created') {
            logger.success(`Unlinked ${link.target}`)
          }
        }
      }

      // Purge source files
      if (argv.purge) {
        const confirmed = await promptConfirm(
          `⚠ This will DELETE tool-specific files from ${config.aiDir}/. Continue?`,
          false
        )

        if (confirmed) {
          const aiPath = join(projectRoot, config.aiDir)
          // Only delete tool-specific files, not shared ones
          const toolSpecificFiles: Record<string, string[]> = {
            claude: ['CLAUDE.md', 'settings/claude.json'],
            gemini: ['GEMINI.md', 'settings/gemini.json'],
            copilot: ['instructions', 'prompts'],
          }

          const filesToDelete = toolSpecificFiles[toolId] || []
          for (const file of filesToDelete) {
            const filePath = join(aiPath, file)
            if (await pathExists(filePath)) {
              await rm(filePath, { recursive: true, force: true })
              logger.success(`Deleted ${config.aiDir}/${file}`)
            }
          }
        }
      }

      // Update config
      config.tools = config.tools.filter((t) => t !== toolId)
      delete config.links[toolId]
      await writeConfig(projectRoot, config)

      logger.newline()
      logger.success(`Removed ${tool.name} from project.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Remove failed: ${message}`)
      process.exit(1)
    }
  },
}
