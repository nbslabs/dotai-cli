import type { CommandModule } from 'yargs'
import { join, basename } from 'path'
import { logger } from '../utils/logger'
import { promptCheckbox, promptInput, promptConfirm } from '../utils/prompt'
import { readConfig, writeConfig, createDefaultConfig, markToolLinked, findProjectRoot } from '../core/config'
import { getToolChoices, getGitignoreEntries, getAllToolIds, getToolById } from '../core/registry'
import { scaffoldAiDir, updateGitignore, collectExistingInstructions } from '../core/scaffold'
import { createSymlink } from '../core/symlink'
import { pathExists } from '../utils/fs'
import { VERSION } from '../version'

interface InitArgs {
  yes?: boolean
  tools?: string
  dir?: string
  'no-link'?: boolean
  'dry-run'?: boolean
}

export const initCommand: CommandModule<{}, InitArgs> = {
  command: 'init',
  describe: 'Initialize .ai/ directory and create .dotai.json',
  builder: (yargs) =>
    yargs
      .option('yes', {
        alias: 'y',
        type: 'boolean',
        description: 'Skip all prompts, use defaults',
      })
      .option('tools', {
        type: 'string',
        description: 'Comma-separated tools: claude,gemini,cursor,copilot,windsurf,codex',
      })
      .option('dir', {
        type: 'string',
        description: 'Custom AI dir name (default: .ai)',
        default: '.ai',
      })
      .option('no-link', {
        type: 'boolean',
        description: 'Scaffold only, do not create symlinks',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Show what would be created without doing it',
      }),

  handler: async (argv) => {
    try {
      const projectRoot = process.cwd()
      const dryRun = argv['dry-run'] || false
      const noLink = argv['no-link'] || false
      const useDefaults = argv.yes || false
      const explicitTools = argv.tools

      logger.title(`dotai v${VERSION}`)
      logger.newline()

      // Check if .dotai.json exists
      const existingConfig = await readConfig(projectRoot)

      // ── Bootstrap from existing .dotai.json ──
      // If config exists and user didn't pass --tools (not a reinit), auto-setup
      if (existingConfig && !explicitTools) {
        const aiDir = existingConfig.aiDir || '.ai'
        const selectedTools = existingConfig.tools

        logger.info(`Found .dotai.json — restoring project for ${selectedTools.length} tool(s)`)
        logger.newline()

        if (selectedTools.length === 0) {
          logger.warn('No tools configured in .dotai.json.')
          return
        }

        if (dryRun) {
          logger.info('[DRY RUN] Would create the following:')
          logger.newline()
        }

        // Scaffold any missing .ai/ files (won't overwrite existing)
        logger.plain('Scaffolding missing .ai/ files...')
        await scaffoldAiDir(projectRoot, {
          projectName: basename(projectRoot),
          projectDescription: '',
          aiDir,
          tools: selectedTools,
        })

        // Link tools
        if (!noLink && !dryRun) {
          logger.newline()
          logger.plain('Linking tools...')

          const config = { ...existingConfig }

          for (const toolId of selectedTools) {
            const tool = getToolById(toolId)
            if (!tool) continue

            const aiPath = join(projectRoot, aiDir)
            let toolLinked = false

            for (const link of tool.links) {
              const source = join(aiPath, link.source)
              const target = join(projectRoot, link.target)

              if (!link.required && !(await pathExists(source))) {
                continue
              }

              const result = await createSymlink(source, target, { force: false })
              if (result.status === 'created' || result.status === 'already-linked') {
                toolLinked = true
              }
            }

            if (toolLinked) {
              markToolLinked(config, toolId)
              const shortTarget = tool.links[0]
                ? `${tool.links[0].target} → ${aiDir}/${tool.links[0].source}`
                : tool.dirName
              logger.success(`${tool.id.padEnd(10)} ${shortTarget}`)
            }
          }

          await writeConfig(projectRoot, config)
        }

        // Update .gitignore (only if configured — defaults to true for older configs)
        if (!dryRun && (existingConfig.gitignore !== false)) {
          const gitignoreEntries = getGitignoreEntries(selectedTools)
          if (gitignoreEntries.length > 0) {
            const count = await updateGitignore(projectRoot, gitignoreEntries)
            if (count > 0) {
              logger.newline()
              logger.success(`Updated .gitignore (+${count} entries)`)
            }
          }
        }

        logger.newline()
        logger.success('Done! Project restored from .dotai.json — all tools linked.')
        return
      }

      // ── Fresh init or reinit with --tools ──
      const aiDir = argv.dir || '.ai'

      logger.info(`Initializing AI config in ${projectRoot}`)
      logger.newline()

      // If config exists and --tools was passed, confirm reinit
      if (existingConfig && explicitTools) {
        if (!useDefaults) {
          const proceed = await promptConfirm('Project already initialized. Reinitialize with new tools?', false)
          if (!proceed) {
            logger.dim('Aborted.')
            return
          }
        }
      }

      // Select tools
      let selectedTools: string[]
      if (explicitTools) {
        selectedTools = explicitTools.split(',').map((t) => t.trim())
      } else if (useDefaults) {
        selectedTools = getAllToolIds().filter((id) => id !== 'codex')
      } else {
        selectedTools = await promptCheckbox(
          'Select AI tools to configure:',
          getToolChoices()
        )
      }

      if (selectedTools.length === 0) {
        logger.warn('No tools selected. Aborting.')
        return
      }

      // Get project info
      let projectName: string
      let projectDescription: string

      if (useDefaults) {
        projectName = basename(projectRoot)
        projectDescription = ''
      } else {
        projectName = await promptInput('Project name:', basename(projectRoot))
        projectDescription = await promptInput('Brief description:', '')
      }

      if (dryRun) {
        logger.info('[DRY RUN] Would create the following:')
        logger.newline()
      }

      // Collect content from existing instruction files (CLAUDE.md, GEMINI.md, etc.)
      const existingContent = await collectExistingInstructions(projectRoot)

      // Scaffold .ai/ directory
      logger.plain('Creating .ai/ structure...')
      const createdFiles = await scaffoldAiDir(projectRoot, {
        projectName,
        projectDescription,
        aiDir,
        tools: selectedTools,
        existingContent: existingContent || undefined,
      })

      // Create .dotai.json
      const config = createDefaultConfig(selectedTools, aiDir)

      if (!dryRun) {
        await writeConfig(projectRoot, config)
        logger.success('.dotai.json')
      }

      // Link tools
      if (!noLink && !dryRun) {
        logger.newline()
        logger.plain('Linking tools...')

        for (const toolId of selectedTools) {
          const tool = getToolById(toolId)
          if (!tool) continue

          const aiPath = join(projectRoot, aiDir)
          let toolLinked = false

          for (const link of tool.links) {
            const source = join(aiPath, link.source)
            const target = join(projectRoot, link.target)

            // Only link if source exists or is required
            if (!link.required && !(await pathExists(source))) {
              continue
            }

            const result = await createSymlink(source, target, { force: false })
            if (result.status === 'created' || result.status === 'already-linked') {
              toolLinked = true
            }
          }

          if (toolLinked) {
            markToolLinked(config, toolId)
            const shortTarget = tool.links[0]
              ? `${tool.links[0].target} → ${aiDir}/${tool.links[0].source}`
              : tool.dirName
            logger.success(`${tool.id.padEnd(10)} ${shortTarget}`)
          }
        }

        await writeConfig(projectRoot, config)
      }

      // Update .gitignore
      if (!dryRun) {
        const gitignoreEntries = getGitignoreEntries(selectedTools)
        if (gitignoreEntries.length > 0) {
          let shouldUpdate = useDefaults
          if (!useDefaults) {
            shouldUpdate = await promptConfirm(
              `Add ${gitignoreEntries.length} entries to .gitignore?`,
              true
            )
          }

          // Save gitignore preference to config
          config.gitignore = shouldUpdate
          await writeConfig(projectRoot, config)

          if (shouldUpdate) {
            const count = await updateGitignore(projectRoot, gitignoreEntries)
            if (count > 0) {
              logger.newline()
              logger.success(`Updated .gitignore (+${count} entries)`)
            }
          }
        }
      }

      logger.newline()
      logger.success('Done! Edit .ai/ files — all tools stay in sync automatically.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Init failed: ${message}`)
      process.exit(1)
    }
  },
}
