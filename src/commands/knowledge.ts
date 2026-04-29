import type { CommandModule } from 'yargs'
import { join } from 'path'
import { rm, readdir } from 'fs/promises'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot, getKnowledgeConfig } from '../core/config'
import { pathExists, ensureDir, writeTextFile, readTextFile } from '../utils/fs'
import { KnowledgeMcpServer } from '../core/knowledge/mcp'
import { getToolById } from '../core/registry'
import { createSymlink } from '../core/symlink'
import { VERSION } from '../version'

interface KnowledgeArgs {}

/**
 * Check that dotai has been initialized.
 */
async function requireInit(projectRoot: string): Promise<import('../core/config').DotAiConfig> {
  const config = await readConfig(projectRoot)
  if (!config) {
    logger.error('No .dotai.json found. Run `dotai init` first.')
    process.exit(1)
  }
  return config
}

function getKnowledgePath(projectRoot: string, aiDir: string): string {
  return join(projectRoot, aiDir, 'knowledge')
}

// ─── Skeleton templates for knowledge files ──────────────────────────────

const SKELETON_INDEX = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Codebase Knowledge Index

> This file maps your codebase modules, exports, and dependencies.
> Populated by AI agents using the /learn command or knowledge_explore + knowledge_append tools.

## Module Map

| Module | Path | Key Exports | Files |
|--------|------|-------------|-------|
<!-- Add modules as you explore the codebase -->

## Dependency Graph

<!-- Describe how modules depend on each other -->

## Quick Reference

<!-- High-level architecture summary -->
`

const SKELETON_PATTERNS = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Patterns

> Recurring code patterns in this project.
> Added by: AI agents (/learn command) and humans.
`

const SKELETON_GOTCHAS = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Gotchas & Edge Cases

> Things that are NOT obvious from reading the code.
> Added by: AI agents (/learn command) and humans.
`

const SKELETON_CHANGELOG = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->
# Changelog

> Recent codebase changes tracked by AI agents.
> Entries are prepended (newest first).

<!-- Entries are prepended (newest first) -->
`

// ─── Skill template ──────────────────────────────────────────────────────

const LEARN_SKILL = `---
description: Deep codebase analysis and knowledge population skill
---

# Knowledge Scan Skill

You are performing a deep analysis of the project codebase. Your goal is to explore
every module, understand the architecture, and persist your findings to the knowledge
base so future sessions don't need to re-discover what you learn now.

## Instructions

1. **Read existing knowledge first** — check \`.ai/knowledge/INDEX.md\`, \`gotchas.md\`,
   \`patterns.md\`, and \`modules/\` to avoid duplicating what's already there.

2. **Explore the codebase systematically** — use \`knowledge_explore\` (MCP) or read
   files directly. Start from the project root, then go deeper into each major directory.

3. **For each module/directory you explore:**
   - Identify key exports, classes, and functions
   - Note dependencies on other modules
   - Look for recurring patterns
   - Spot gotchas, edge cases, and non-obvious constraints
   - Check for undocumented configuration or environment requirements

4. **Persist findings immediately** — for each discovery:
   - Use \`knowledge_append\` with \`target: "gotchas"\` for edge cases and constraints
   - Use \`knowledge_append\` with \`target: "patterns"\` for recurring patterns
   - Use \`knowledge_append\` with \`module: "<name>"\` for module-specific findings

5. **Update AI.md** — use \`knowledge_populate_ai_md\` to fill in:
   - Project Overview
   - Architecture (directory → purpose mapping)
   - Tech Stack (with versions)
   - Key Commands (build, test, dev)
   - Important Constraints
   - Common Pitfalls

6. **Update INDEX.md** — manually edit \`.ai/knowledge/INDEX.md\` to add a row for
   each module you analyzed with its path, key exports, and file count.

## What NOT to persist
- Trivially obvious information readable from the code
- Task-specific context that won't help future sessions
- Information already in the knowledge base
`

// ─── Slash command templates ─────────────────────────────────────────────

function getLearnCommandClaude(): string {
  return `# /learn — Deep Codebase Scan

Perform a comprehensive scan of the entire codebase and populate the knowledge base.

## Instructions

Read the skill file at \`.ai/skills/knowledge-scan-skill/SKILL.md\` and follow its
instructions to explore the codebase, analyze it deeply, and persist all findings
to \`.ai/knowledge/\`.

Start by checking what's already in the knowledge base, then systematically explore
every directory and file. Persist each finding immediately — don't batch them.

When done, report a summary of what you learned and what was persisted.
`
}

function getLearnCommandGemini(): string {
  return `[command]
description = "Deep codebase scan — explore all modules and populate .ai/knowledge/"

[command.instructions]
text = """
Read the skill file at \`.ai/skills/knowledge-scan-skill/SKILL.md\` and follow its
instructions to explore the codebase, analyze it deeply, and persist all findings
to \`.ai/knowledge/\`.

Start by checking what's already in the knowledge base, then systematically explore
every directory and file. Persist each finding immediately.

When done, report a summary of what you learned and what was persisted.
"""
`
}

function getLearnCommandAntigravity(): string {
  return `# /learn — Deep Codebase Scan

Perform a comprehensive scan of the entire codebase and populate the knowledge base.

## Instructions

Read the skill file at \`.ai/skills/knowledge-scan-skill/SKILL.md\` and follow its
instructions to explore the codebase, analyze it deeply, and persist all findings
to \`.ai/knowledge/\`.

Start by checking what's already in the knowledge base, then systematically explore
every directory and file. Persist each finding immediately — don't batch them.

When done, report a summary of what you learned and what was persisted.
`
}

function getLearnCommandCopilot(): string {
  return `---
mode: agent
description: Deep codebase scan — explore all modules and populate .ai/knowledge/
---

Read the skill file at \`.ai/skills/knowledge-scan-skill/SKILL.md\` and follow its
instructions to explore the codebase, analyze it deeply, and persist all findings
to \`.ai/knowledge/\`.

Start by checking what's already in the knowledge base, then systematically explore
every directory and file. Persist each finding immediately.

When done, report a summary of what you learned and what was persisted.
`
}

// ─── Symlink refresh helper ──────────────────────────────────────────────

async function refreshSymlinks(projectRoot: string, aiDir: string, tools: string[]): Promise<void> {
  const sources = ['knowledge', 'skills', 'commands', 'commands-gemini', 'workflows', 'prompts']
  for (const toolId of tools) {
    const tool = getToolById(toolId)
    if (!tool) continue
    for (const link of tool.links) {
      if (sources.includes(link.source)) {
        const src = join(projectRoot, aiDir, link.source)
        if (await pathExists(src)) {
          await createSymlink(src, join(projectRoot, link.target), { force: false })
        }
      }
    }
  }
}

// ─── Command targets for /learn ──────────────────────────────────────────

interface CmdTarget {
  toolId: string
  dir: string
  filename: string
  content: () => string
}

const LEARN_CMD_TARGETS: CmdTarget[] = [
  { toolId: 'claude', dir: 'commands', filename: 'learn.md', content: getLearnCommandClaude },
  { toolId: 'gemini', dir: 'commands-gemini', filename: 'learn.toml', content: getLearnCommandGemini },
  { toolId: 'antigravity', dir: 'workflows', filename: 'learn.md', content: getLearnCommandAntigravity },
  { toolId: 'copilot', dir: 'prompts', filename: 'learn.prompt.md', content: getLearnCommandCopilot },
]

// ═══════════════════════════════════════════════════════════════════════════

export const knowledgeCommand: CommandModule<{}, KnowledgeArgs> = {
  command: 'knowledge <subcommand>',
  describe: 'Manage persistent codebase knowledge base',
  builder: (yargs) =>
    yargs

      // ─── knowledge init ─────────────────────────────────────
      .command(
        'init',
        'Initialize knowledge base with directory structure, AI skills, and /learn commands',
        (y) =>
          y
            .option('force', {
              type: 'boolean',
              description: 'Re-write skill and command files (preserves knowledge data)',
            }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await requireInit(projectRoot)
            const aiDir = config.aiDir || '.ai'
            const knowledgePath = getKnowledgePath(projectRoot, aiDir)
            const force = argv.force || false

            logger.title(`dotai knowledge init — v${VERSION}`)
            logger.newline()

            // 1. Create knowledge directory structure
            await ensureDir(join(knowledgePath, 'modules'))
            await ensureDir(join(knowledgePath, 'decisions'))
            logger.success('.ai/knowledge/')
            logger.success('.ai/knowledge/modules/')

            // 2. Write skeleton files (don't overwrite existing data)
            const skeletons: [string, string][] = [
              [join(knowledgePath, 'INDEX.md'), SKELETON_INDEX],
              [join(knowledgePath, 'patterns.md'), SKELETON_PATTERNS],
              [join(knowledgePath, 'gotchas.md'), SKELETON_GOTCHAS],
              [join(knowledgePath, 'changelog.md'), SKELETON_CHANGELOG],
            ]

            for (const [filePath, content] of skeletons) {
              if (force || !(await pathExists(filePath))) {
                await writeTextFile(filePath, content)
                logger.success(filePath.replace(projectRoot + '/', ''))
              } else {
                logger.dim(`  skip ${filePath.replace(projectRoot + '/', '')} (exists)`)
              }
            }

            // 3. Create knowledge-scan skill
            const skillDir = join(projectRoot, aiDir, 'skills', 'knowledge-scan-skill')
            const skillPath = join(skillDir, 'SKILL.md')
            if (force || !(await pathExists(skillPath))) {
              await ensureDir(skillDir)
              await writeTextFile(skillPath, LEARN_SKILL)
              logger.success(`${aiDir}/skills/knowledge-scan-skill/SKILL.md`)
            } else {
              logger.dim(`  skip ${aiDir}/skills/knowledge-scan-skill/SKILL.md (exists)`)
            }

            // 4. Create /learn command for each enabled tool
            logger.newline()
            logger.info('Creating /learn commands:')
            for (const target of LEARN_CMD_TARGETS) {
              if (!config.tools.includes(target.toolId)) continue
              const cmdDir = join(projectRoot, aiDir, target.dir)
              const cmdPath = join(cmdDir, target.filename)
              if (force || !(await pathExists(cmdPath))) {
                await ensureDir(cmdDir)
                await writeTextFile(cmdPath, target.content())
                logger.success(`  ${aiDir}/${target.dir}/${target.filename} (${target.toolId})`)
              } else {
                logger.dim(`  skip ${aiDir}/${target.dir}/${target.filename} (exists)`)
              }
            }

            // 5. Update config
            const knowledgeConfig = getKnowledgeConfig(config)
            config.knowledge = { ...knowledgeConfig, enabled: true }
            await writeConfig(projectRoot, config)

            // 6. Refresh symlinks
            logger.newline()
            logger.info('Refreshing symlinks...')
            await refreshSymlinks(projectRoot, aiDir, config.tools)

            logger.newline()
            logger.success('Knowledge base initialized')
            logger.newline()
            logger.info('Next step: Ask your AI agent to populate the knowledge base:')
            logger.newline()
            logger.plain('  /learn')
            logger.newline()
            logger.dim('Or prompt your agent directly:')
            logger.dim('  "Explore this codebase and populate .ai/knowledge/ with')
            logger.dim('   architecture, patterns, and gotchas."')
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge init failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── knowledge serve ────────────────────────────────────
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
            const projectRoot = argv.project || (await findProjectRoot()) || process.cwd()

            process.stderr.write(`dotai MCP: project root = ${projectRoot}\n`)

            // MCP server runs independently — no .dotai.json required.
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

      // ─── knowledge status ───────────────────────────────────
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

            const exists = await pathExists(knowledgePath)
            if (!exists) {
              logger.warn('Knowledge directory does not exist')
              logger.dim("Run 'dotai knowledge init' to create it")
              return
            }
            logger.success('Knowledge directory exists')

            // Count modules
            const modulesDir = join(knowledgePath, 'modules')
            let moduleCount = 0
            if (await pathExists(modulesDir)) {
              const entries = await readdir(modulesDir)
              moduleCount = entries.filter((e) => e.endsWith('.md')).length
            }
            logger.info(`${moduleCount} module(s) indexed`)

            // Check skeleton files
            const skeletonFiles = ['INDEX.md', 'patterns.md', 'gotchas.md', 'changelog.md']
            let missingCount = 0
            for (const f of skeletonFiles) {
              if (!(await pathExists(join(knowledgePath, f)))) {
                missingCount++
              }
            }
            if (missingCount > 0) {
              logger.warn(`${missingCount} skeleton file(s) missing — run \`dotai knowledge init\` to restore`)
            } else {
              logger.success('All skeleton files present')
            }

            // Check knowledge-scan skill
            const skillPath = join(projectRoot, config.aiDir, 'skills', 'knowledge-scan-skill', 'SKILL.md')
            if (await pathExists(skillPath)) {
              logger.success('Knowledge scan skill installed')
            } else {
              logger.dim('Knowledge scan skill not found — run `dotai knowledge init`')
            }

            // Check /learn command
            let learnCount = 0
            for (const target of LEARN_CMD_TARGETS) {
              if (!config.tools.includes(target.toolId)) continue
              const cmdPath = join(projectRoot, config.aiDir, target.dir, target.filename)
              if (await pathExists(cmdPath)) learnCount++
            }
            const enabledCount = LEARN_CMD_TARGETS.filter((t) => config.tools.includes(t.toolId)).length
            if (learnCount > 0) {
              logger.success(`/learn command installed (${learnCount}/${enabledCount} tools)`)
            } else {
              logger.dim('/learn command not found — run `dotai knowledge init`')
            }

            // Check gotchas and patterns for content
            for (const f of ['gotchas.md', 'patterns.md']) {
              const filePath = join(knowledgePath, f)
              if (await pathExists(filePath)) {
                const content = await readTextFile(filePath)
                const hasEntries = content.includes('### ')
                if (hasEntries) {
                  logger.dim(`  ${f} has entries ✓`)
                } else {
                  logger.dim(`  ${f} is empty — run /learn to populate`)
                }
              }
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Knowledge status failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── knowledge clean ────────────────────────────────────
      .command(
        'clean',
        'Delete knowledge base for fresh start',
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
            logger.success('Knowledge base deleted. Run `dotai knowledge init` to rebuild.')

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
      .demandCommand(1, 'Specify a subcommand. Run `dotai knowledge --help` for usage.')
      .strict(),

  handler: async () => {
    // Subcommands handle everything
  },
}
