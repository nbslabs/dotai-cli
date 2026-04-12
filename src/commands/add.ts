import type { CommandModule } from 'yargs'
import { join } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, markToolLinked } from '../core/config'
import { getToolById, isValidToolId } from '../core/registry'
import { createSymlink } from '../core/symlink'
import { scaffoldAiDir } from '../core/scaffold'
import { pathExists } from '../utils/fs'

interface AddArgs {
  tool: string
  link?: boolean
  'dry-run'?: boolean
}

export const addCommand: CommandModule<{}, AddArgs> = {
  command: 'add <tool>',
  describe: 'Add a new tool to an already-initialized project',
  builder: (yargs) =>
    yargs
      .positional('tool', {
        type: 'string',
        description: 'Tool ID: claude | gemini | copilot | antigravity',
        demandOption: true,
      })
      .option('link', {
        type: 'boolean',
        description: 'Auto-link after adding',
        default: true,
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Preview only',
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
      const dryRun = argv['dry-run'] || false

      if (!isValidToolId(toolId)) {
        logger.error(`Unknown tool: ${toolId}. Use \`dotai list --all\` to see available tools.`)
        process.exit(1)
        return
      }

      if (config.tools.includes(toolId)) {
        logger.warn(`Tool '${toolId}' is already configured.`)
        return
      }

      const tool = getToolById(toolId)!

      logger.title(`dotai add ${toolId}`)
      logger.newline()

      if (dryRun) {
        logger.info(`[DRY RUN] Would add ${tool.name} to project config`)
        return
      }

      // Add to config
      config.tools.push(toolId)
      config.links[toolId] = { linked: false }

      // Create tool-specific template files if needed
      logger.plain('Creating tool-specific files...')
      await scaffoldAiDir(projectRoot, {
        projectName: '',
        projectDescription: '',
        aiDir: config.aiDir,
        tools: [toolId],
      })

      // Link if requested
      if (argv.link !== false) {
        logger.newline()
        logger.plain(`Linking ${tool.name}...`)

        const aiPath = join(projectRoot, config.aiDir)
        for (const link of tool.links) {
          const source = join(aiPath, link.source)
          const target = join(projectRoot, link.target)

          if (!link.required && !(await pathExists(source))) continue

          const result = await createSymlink(source, target, { force: false })
          if (result.status === 'created' || result.status === 'already-linked') {
            logger.success(`${link.target} → ${config.aiDir}/${link.source}`)
          }
        }

        markToolLinked(config, toolId)
      }

      await writeConfig(projectRoot, config)

      logger.newline()
      logger.success(`Added ${tool.name} to project.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Add failed: ${message}`)
      process.exit(1)
    }
  },
}
