import type { CommandModule } from 'yargs'
import { join } from 'path'
import { readdir, rm } from 'fs/promises'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig, findProjectRoot } from '../core/config'
import { pathExists, ensureDir, writeTextFile, readTextFile } from '../utils/fs'
import { getToolById } from '../core/registry'
import { createSymlink } from '../core/symlink'

interface SkillArgs {}

function getSkillTemplate(name: string): string {
  return `---
description: ${name} skill
---

# ${name}

<!-- Describe what this skill does and when to use it -->

## Instructions

<!-- Write the skill instructions that the AI agent should follow -->
`
}

async function refreshSkillSymlinks(projectRoot: string, aiDir: string, tools: string[]): Promise<void> {
  const src = join(projectRoot, aiDir, 'skills')
  if (!(await pathExists(src))) return
  for (const toolId of tools) {
    const tool = getToolById(toolId)
    if (!tool) continue
    const link = tool.links.find((l) => l.source === 'skills')
    if (!link) continue
    await createSymlink(src, join(projectRoot, link.target), { force: false })
  }
}

export const skillCommand: CommandModule<{}, SkillArgs> = {
  command: 'skill <subcommand>',
  describe: 'Manage reusable skill packages in .ai/skills/',
  builder: (yargs) =>
    yargs
      .command(
        'add <name>',
        'Create a new skill package with template SKILL.md',
        (y) =>
          y.positional('name', { type: 'string', description: 'Skill name (kebab-case)', demandOption: true })
           .option('description', { type: 'string', description: 'Brief description', alias: 'd' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const skillPath = join(projectRoot, aiDir, 'skills', name)

            logger.title(`dotai skill add — ${name}`)
            logger.newline()

            if (!/^[a-z][a-z0-9-]*$/.test(name)) {
              logger.error('Skill name must be lowercase kebab-case (e.g. "code-review")')
              process.exit(1); return
            }
            if (await pathExists(skillPath)) { logger.warn(`Skill '${name}' already exists.`); return }

            await ensureDir(skillPath)
            let tpl = getSkillTemplate(name)
            if (argv.description) tpl = tpl.replace(`description: ${name} skill`, `description: ${argv.description}`)
            await writeTextFile(join(skillPath, 'SKILL.md'), tpl)
            logger.success(`${aiDir}/skills/${name}/SKILL.md`)

            await refreshSkillSymlinks(projectRoot, aiDir, config.tools)
            logger.newline()
            logger.success(`Skill '${name}' created`)
            logger.dim(`Edit ${aiDir}/skills/${name}/SKILL.md to define the skill`)
          } catch (err: unknown) {
            logger.error(`Skill add failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'remove <name>',
        'Remove a skill package',
        (y) =>
          y.positional('name', { type: 'string', description: 'Skill name', demandOption: true })
           .option('yes', { type: 'boolean', description: 'Skip confirmation', alias: 'y' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const skillPath = join(projectRoot, aiDir, 'skills', name)

            logger.title(`dotai skill remove — ${name}`)
            logger.newline()

            if (!(await pathExists(skillPath))) {
              logger.error(`Skill '${name}' not found.`); process.exit(1); return
            }
            if (!argv.yes) {
              const { promptConfirm } = await import('../utils/prompt')
              if (!(await promptConfirm(`Delete ${aiDir}/skills/${name}/?`, false))) { logger.dim('Aborted.'); return }
            }
            await rm(skillPath, { recursive: true, force: true })
            logger.success(`Skill '${name}' removed`)
          } catch (err: unknown) {
            logger.error(`Skill remove failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'list',
        'List all skill packages',
        (y) => y.option('json', { type: 'boolean', description: 'Output as JSON' }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const aiDir = config.aiDir || '.ai'
            const skillsPath = join(projectRoot, aiDir, 'skills')

            logger.title('Skills')
            logger.newline()

            if (!(await pathExists(skillsPath))) {
              logger.dim('No skills directory. Run `dotai skill add <name>`.'); return
            }

            const entries = await readdir(skillsPath, { withFileTypes: true })
            const skills = entries.filter((e) => e.isDirectory()).map((e) => e.name)

            if (skills.length === 0) { logger.dim('No skills found.'); return }

            const toolsWithSkills = config.tools.filter((t) => getToolById(t)?.links.some((l) => l.source === 'skills'))
            const data: { name: string; hasSkillMd: boolean; description: string }[] = []

            for (const s of skills) {
              const mdPath = join(skillsPath, s, 'SKILL.md')
              const has = await pathExists(mdPath)
              let desc = ''
              if (has) {
                const c = await readTextFile(mdPath)
                const m = c.match(/description:\s*(.+)/i)
                if (m) desc = m[1].trim()
              }
              data.push({ name: s, hasSkillMd: has, description: desc })
            }

            if (argv.json) { console.log(JSON.stringify(data, null, 2)); return }

            for (const sk of data) {
              const icon = sk.hasSkillMd ? pc.green('✓') : pc.yellow('○')
              logger.plain(`${icon} ${pc.bold(sk.name)}`)
              if (sk.description) logger.dim(`  ${sk.description}`)
              if (!sk.hasSkillMd) logger.dim(`  ${pc.yellow('Missing SKILL.md')}`)
            }
            logger.newline()
            logger.dim(`${skills.length} skill(s) — linked to: ${toolsWithSkills.join(', ') || 'none'}`)
          } catch (err: unknown) {
            logger.error(`Skill list failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai skill --help` for usage.')
      .strict(),

  handler: async () => {},
}
