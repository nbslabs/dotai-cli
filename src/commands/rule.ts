import type { CommandModule } from 'yargs'
import { join } from 'path'
import { readdir, rm } from 'fs/promises'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig, findProjectRoot } from '../core/config'
import { pathExists, ensureDir, writeTextFile, readTextFile } from '../utils/fs'

interface RuleArgs {}

function getRuleTemplate(name: string, alwaysApply: boolean): string {
  return `---
description: ${name} rules
alwaysApply: ${alwaysApply}
---

# ${name.charAt(0).toUpperCase() + name.slice(1)} Rules

<!-- Add your coding rules here -->
`
}

export const ruleCommand: CommandModule<{}, RuleArgs> = {
  command: 'rule <subcommand>',
  describe: 'Manage coding rules in .ai/rules/',
  builder: (yargs) =>
    yargs
      .command(
        'add <name>',
        'Create a new rule file',
        (y) =>
          y.positional('name', { type: 'string', description: 'Rule name (e.g. "api-conventions")', demandOption: true })
           .option('always', { type: 'boolean', description: 'Always apply this rule (alwaysApply: true)', default: false }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const rulesPath = join(projectRoot, aiDir, 'rules')
            const fileName = name.endsWith('.md') ? name : `${name}.md`
            const filePath = join(rulesPath, fileName)

            logger.title(`dotai rule add — ${name}`)
            logger.newline()

            if (await pathExists(filePath)) { logger.warn(`Rule '${fileName}' already exists.`); return }

            await ensureDir(rulesPath)
            await writeTextFile(filePath, getRuleTemplate(name.replace('.md', ''), argv.always!))
            logger.success(`${aiDir}/rules/${fileName}`)
            logger.newline()
            logger.dim(`Edit ${aiDir}/rules/${fileName} to define the rule`)
          } catch (err: unknown) {
            logger.error(`Rule add failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'remove <name>',
        'Remove a rule file',
        (y) =>
          y.positional('name', { type: 'string', description: 'Rule file name', demandOption: true })
           .option('yes', { type: 'boolean', description: 'Skip confirmation', alias: 'y' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const fileName = name.endsWith('.md') ? name : `${name}.md`
            const filePath = join(projectRoot, aiDir, 'rules', fileName)

            logger.title(`dotai rule remove — ${name}`)
            logger.newline()

            if (!(await pathExists(filePath))) {
              logger.error(`Rule '${fileName}' not found.`); process.exit(1); return
            }
            if (!argv.yes) {
              const { promptConfirm } = await import('../utils/prompt')
              if (!(await promptConfirm(`Delete ${aiDir}/rules/${fileName}?`, false))) { logger.dim('Aborted.'); return }
            }
            await rm(filePath, { force: true })
            logger.success(`Rule '${fileName}' removed`)
          } catch (err: unknown) {
            logger.error(`Rule remove failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'list',
        'List all rule files',
        (y) => y.option('json', { type: 'boolean', description: 'Output as JSON' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const aiDir = config.aiDir || '.ai'
            const rulesPath = join(projectRoot, aiDir, 'rules')

            logger.title('Rules')
            logger.newline()

            if (!(await pathExists(rulesPath))) { logger.dim('No rules directory found.'); return }

            const entries = await readdir(rulesPath)
            const ruleFiles = entries.filter((e) => e.endsWith('.md'))

            if (ruleFiles.length === 0) { logger.dim('No rules found.'); return }

            const data: { name: string; description: string; alwaysApply: boolean }[] = []

            for (const file of ruleFiles) {
              const content = await readTextFile(join(rulesPath, file))
              const descMatch = content.match(/description:\s*(.+)/i)
              const alwaysMatch = content.match(/alwaysApply:\s*(true|false)/i)
              data.push({
                name: file,
                description: descMatch ? descMatch[1].trim() : '',
                alwaysApply: alwaysMatch ? alwaysMatch[1] === 'true' : false,
              })
            }

            if (argv.json) { console.log(JSON.stringify(data, null, 2)); return }

            for (const rule of data) {
              const badge = rule.alwaysApply ? pc.green(' [always]') : pc.gray(' [on-demand]')
              logger.plain(`${pc.bold(rule.name)}${badge}`)
              if (rule.description) logger.dim(`  ${rule.description}`)
            }
            logger.newline()
            logger.dim(`${ruleFiles.length} rule(s)`)
          } catch (err: unknown) {
            logger.error(`Rule list failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai rule --help` for usage.')
      .strict(),

  handler: async () => {},
}
