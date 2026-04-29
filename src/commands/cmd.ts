import type { CommandModule } from 'yargs'
import { join } from 'path'
import { readdir, rm } from 'fs/promises'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig, findProjectRoot } from '../core/config'
import { pathExists, ensureDir, writeTextFile } from '../utils/fs'

interface CmdArgs {}

function getCommandTemplateMd(name: string): string {
  return `# /${name} Command

<!-- Describe what this command does -->

## Steps

1. <!-- First step -->
2. <!-- Second step -->
3. <!-- Third step -->
`
}

function getCommandTemplateToml(name: string): string {
  return `description = "${name} command"
prompt = """
<!-- Describe what this command does -->

{{args}}
"""
`
}

function getWorkflowTemplate(name: string): string {
  return `---
description: ${name} workflow
---

# ${name} Workflow

<!-- Define the workflow steps for Antigravity -->

1. <!-- First step -->
2. <!-- Second step -->
3. <!-- Third step -->
`
}

function getPromptTemplate(name: string): string {
  return `---
description: ${name} prompt
---

<!-- Describe the purpose and context for this prompt -->
`
}

/**
 * All command format targets, keyed by directory name relative to .ai/.
 * Each entry knows which tools use it and the file extension.
 */
interface CmdTarget {
  dir: string        // relative to .ai/
  ext: string        // file extension (e.g. '.md', '.toml')
  tools: string[]    // which tool IDs use this format
  label: string      // display label for this format
  template: (name: string) => string
}

const CMD_TARGETS: CmdTarget[] = [
  {
    dir: 'commands',
    ext: '.md',
    tools: ['claude'],
    label: 'commands',
    template: getCommandTemplateMd,
  },
  {
    dir: 'commands-gemini',
    ext: '.toml',
    tools: ['gemini'],
    label: 'commands-gemini',
    template: getCommandTemplateToml,
  },
  {
    dir: 'workflows',
    ext: '.md',
    tools: ['antigravity'],
    label: 'workflows',
    template: getWorkflowTemplate,
  },
  {
    dir: 'prompts',
    ext: '.prompt.md',
    tools: ['copilot'],
    label: 'prompts',
    template: getPromptTemplate,
  },
]

/**
 * Determine which targets are active based on enabled tools.
 */
function getActiveTargets(tools: string[]): CmdTarget[] {
  return CMD_TARGETS.filter((t) => t.tools.some((id) => tools.includes(id)))
}

/**
 * Get the filename for a target (handles multi-part extensions like .prompt.md).
 */
function getFileName(baseName: string, target: CmdTarget): string {
  return `${baseName}${target.ext}`
}

/**
 * Strip all known extensions to get the base command name.
 */
function toBaseName(name: string): string {
  return name
    .replace(/\.prompt\.md$/, '')
    .replace(/\.toml$/, '')
    .replace(/\.md$/, '')
}

export const cmdCommand: CommandModule<{}, CmdArgs> = {
  command: 'cmd <subcommand>',
  describe: 'Manage custom slash commands in .ai/commands/',
  builder: (yargs) =>
    yargs
      .command(
        'add <name>',
        'Create a new slash command across all enabled tool formats',
        (y) =>
          y.positional('name', { type: 'string', description: 'Command name (e.g. "test")', demandOption: true }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const baseName = toBaseName(argv.name as string)
            const aiDir = config.aiDir || '.ai'
            const targets = getActiveTargets(config.tools)

            logger.title(`dotai cmd add — ${baseName}`)
            logger.newline()

            if (targets.length === 0) {
              logger.warn('No tools are configured that use commands.')
              logger.dim('Enable a tool first: dotai add claude|gemini|antigravity|copilot')
              return
            }

            let createdCount = 0

            for (const target of targets) {
              const dirPath = join(projectRoot, aiDir, target.dir)
              const fileName = getFileName(baseName, target)
              const filePath = join(dirPath, fileName)

              await ensureDir(dirPath)

              if (await pathExists(filePath)) {
                logger.warn(`${target.label}/${fileName} already exists`)
              } else {
                await writeTextFile(filePath, target.template(baseName))
                logger.success(`${aiDir}/${target.label}/${fileName}`)
                createdCount++
              }
            }

            logger.newline()
            if (createdCount > 0) {
              logger.success(`Command '/${baseName}' created in ${createdCount} format(s)`)
              logger.dim('Edit the file(s) to define the command behavior')
            } else {
              logger.warn('All files already existed — nothing created')
            }
          } catch (err: unknown) {
            logger.error(`Cmd add failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'remove <name>',
        'Remove a slash command from all formats',
        (y) =>
          y.positional('name', { type: 'string', description: 'Command name', demandOption: true })
           .option('yes', { type: 'boolean', description: 'Skip confirmation', alias: 'y' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const baseName = toBaseName(argv.name as string)
            const aiDir = config.aiDir || '.ai'

            logger.title(`dotai cmd remove — ${baseName}`)
            logger.newline()

            // Check all targets (not just active ones) so we clean up fully
            const filesToDelete: { path: string; label: string }[] = []

            for (const target of CMD_TARGETS) {
              const fileName = getFileName(baseName, target)
              const filePath = join(projectRoot, aiDir, target.dir, fileName)
              if (await pathExists(filePath)) {
                filesToDelete.push({ path: filePath, label: `${target.label}/${fileName}` })
              }
            }

            if (filesToDelete.length === 0) {
              logger.error(`Command '${baseName}' not found in any format.`)
              process.exit(1)
              return
            }

            if (!argv.yes) {
              const { promptConfirm } = await import('../utils/prompt')
              const fileList = filesToDelete.map((f) => f.label).join(', ')
              if (!(await promptConfirm(`Delete /${baseName} (${fileList})?`, false))) {
                logger.dim('Aborted.')
                return
              }
            }

            for (const file of filesToDelete) {
              await rm(file.path, { force: true })
              logger.success(`Removed ${file.label}`)
            }
          } catch (err: unknown) {
            logger.error(`Cmd remove failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'list',
        'List all slash commands across all formats',
        (y) => y.option('json', { type: 'boolean', description: 'Output as JSON' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const aiDir = config.aiDir || '.ai'

            logger.title('Commands')
            logger.newline()

            // Scan all target directories
            const filesByTarget: Record<string, string[]> = {}

            for (const target of CMD_TARGETS) {
              const dirPath = join(projectRoot, aiDir, target.dir)
              filesByTarget[target.dir] = []
              if (await pathExists(dirPath)) {
                const entries = await readdir(dirPath)
                filesByTarget[target.dir] = entries.filter((e) => e.endsWith(target.ext))
              }
            }

            // Merge by base name
            const commandMap = new Map<string, { dir: string; ext: string; label: string }[]>()

            for (const target of CMD_TARGETS) {
              for (const file of filesByTarget[target.dir]) {
                const base = file.replace(new RegExp(`\\${target.ext}$`), '')
                if (!commandMap.has(base)) commandMap.set(base, [])
                commandMap.get(base)!.push({ dir: target.dir, ext: target.ext, label: target.label })
              }
            }

            if (commandMap.size === 0) {
              logger.dim('No commands found. Run `dotai cmd add <name>`.')
              return
            }

            const sortedNames = Array.from(commandMap.keys()).sort()

            const data = sortedNames.map((name) => {
              const targets = commandMap.get(name)!
              return {
                name,
                formats: targets.map((t) => ({ dir: t.dir, ext: t.ext })),
              }
            })

            if (argv.json) { console.log(JSON.stringify(data, null, 2)); return }

            const extColors: Record<string, (s: string) => string> = {
              '.md': pc.cyan,
              '.toml': pc.yellow,
              '.prompt.md': pc.magenta,
            }

            for (const cmd of data) {
              const formats = cmd.formats.map((f) => {
                const colorFn = extColors[f.ext] || pc.white
                return colorFn(`${f.dir}/${f.ext}`)
              })
              logger.plain(`${pc.bold(`/${cmd.name}`)}  ${pc.dim(`[${formats.join(', ')}]`)}`)
            }

            logger.newline()
            logger.dim(`${commandMap.size} command(s)`)
          } catch (err: unknown) {
            logger.error(`Cmd list failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai cmd --help` for usage.')
      .strict(),

  handler: async () => {},
}
