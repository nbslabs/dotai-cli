import type { CommandModule } from 'yargs'
import { join } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot, getSddConfig } from '../core/config'
import { pathExists, dirExists } from '../utils/fs'
import {
  scaffoldSdd,
  createFeature,
  validateFeatureName,
  listFeatures,
  detectFeaturePhase,
} from '../core/sdd-scaffold'
import { VERSION } from '../version'
import pc from 'picocolors'

interface SddArgs {
  force?: boolean
}

/**
 * Check that dotai has been initialized (i.e. .ai/ directory exists).
 */
async function requireAiDir(projectRoot: string, aiDir: string): Promise<void> {
  const aiPath = join(projectRoot, aiDir)
  if (!(await pathExists(aiPath))) {
    logger.error('dotai is not initialized. Run `dotai init` first.')
    process.exit(1)
  }
}

/**
 * Check that SDD has been initialized.
 */
async function requireSddInit(projectRoot: string, aiDir: string): Promise<void> {
  const sddPath = join(projectRoot, aiDir, 'sdd')
  if (!(await pathExists(sddPath))) {
    logger.error('SDD toolkit is not initialized. Run `dotai sdd init` first.')
    process.exit(1)
  }
}

/**
 * Get phase display with color.
 */
function phaseDisplay(phase: number, phaseName: string): string {
  const colors: Record<number, (s: string) => string> = {
    0: pc.gray,
    1: pc.white,
    2: pc.cyan,
    3: pc.cyan,
    4: pc.blue,
    5: pc.yellow,
    6: pc.yellow,
    7: pc.magenta,
    8: pc.green,
  }
  const colorFn = colors[phase] || pc.white
  return colorFn(`Phase ${phase} (${phaseName})`)
}

export const sddCommand: CommandModule<{}, SddArgs> = {
  command: 'sdd <subcommand>',
  describe: 'Spec-Driven Development toolkit',
  builder: (yargs) =>
    yargs
      // ─── sdd init ──────────────────────────────────────────
      .command(
        'init',
        'Initialize the SDD toolkit (skills, templates, commands)',
        (y) =>
          y
            .option('force', {
              type: 'boolean',
              description: 'Re-write skills, README, and commands (preserves feature dirs)',
            })
            .option('dry-run', {
              type: 'boolean',
              description: 'Show what would be created without doing it',
            }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
            }

            const aiDir = config.aiDir || '.ai'
            await requireAiDir(projectRoot, aiDir)

            logger.title(`dotai sdd init — v${VERSION}`)
            logger.newline()

            const force = argv.force || false
            const dryRun = argv['dry-run'] || false

            // Check if already initialized (unless --force)
            const sddPath = join(projectRoot, aiDir, 'sdd')
            if (!force && (await pathExists(sddPath))) {
              logger.warn('SDD toolkit already initialized. Nothing was changed.')
              logger.dim('Use --force to re-write skills, README, and commands.')
              return
            }

            if (dryRun) {
              logger.info('[DRY RUN] Would create the following:')
              logger.newline()
            }

            if (force) {
              logger.info('Re-writing skills, README, and commands (feature dirs preserved)...')
              logger.newline()
            }

            // Scaffold everything
            const result = await scaffoldSdd(projectRoot, aiDir, { force })

            // Update config
            if (!dryRun) {
              config.sdd = {
                enabled: true,
                initializedAt: new Date().toISOString(),
              }
              await writeConfig(projectRoot, config)
            }

            logger.newline()
            logger.success(`SDD toolkit initialized — ${result.createdFiles.length} files created`)
            if (result.skippedFiles.length > 0) {
              logger.dim(`${result.skippedFiles.length} file(s) already existed (skipped)`)
            }
            logger.newline()
            logger.info('Next steps:')
            logger.plain('  1. Create a feature:  dotai sdd new my-feature-name')
            logger.plain('  2. Write your idea:   Edit .ai/sdd/my-feature-name/idea.md')
            logger.plain('  3. Run Phase 2:       /sdd-specify my-feature-name')
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`SDD init failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── sdd new ───────────────────────────────────────────
      .command(
        'new <feature-name>',
        'Create a new feature directory from template',
        (y) =>
          y.positional('feature-name', {
            type: 'string',
            description: 'Feature name (lowercase kebab-case)',
            demandOption: true,
          }),
        async (argv) => {
          try {
            const featureName = argv['feature-name'] as string
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
            }

            const aiDir = config.aiDir || '.ai'
            await requireSddInit(projectRoot, aiDir)

            logger.title(`dotai sdd new — v${VERSION}`)
            logger.newline()

            // Validate feature name
            const validationError = validateFeatureName(featureName)
            if (validationError) {
              logger.error(validationError)
              process.exit(1)
            }

            // Check if feature already exists
            const sddPath = join(projectRoot, aiDir, 'sdd')
            const featurePath = join(sddPath, featureName)
            if (await pathExists(featurePath)) {
              logger.error(`Feature '${featureName}' already exists at ${aiDir}/sdd/${featureName}/`)
              process.exit(1)
            }

            // Create feature
            const createdFiles = await createFeature(sddPath, featureName, aiDir)
            for (const f of createdFiles) {
              logger.success(f)
            }

            logger.newline()
            logger.success(`Feature '${featureName}' created`)
            logger.newline()
            logger.info('Next step:')
            logger.plain(`  Edit ${aiDir}/sdd/${featureName}/idea.md with your feature idea`)
            logger.plain(`  Then run: /sdd-specify ${featureName}`)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`SDD new failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── sdd list ──────────────────────────────────────────
      .command(
        'list',
        'List all SDD features and their current phase',
        (y) => y,
        async () => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
            }

            const aiDir = config.aiDir || '.ai'
            await requireSddInit(projectRoot, aiDir)

            logger.title(`dotai sdd list — v${VERSION}`)
            logger.newline()

            const sddPath = join(projectRoot, aiDir, 'sdd')
            const features = await listFeatures(sddPath)

            if (features.length === 0) {
              logger.dim('No features found.')
              logger.dim('Create one with: dotai sdd new <feature-name>')
              return
            }

            for (const featureName of features) {
              const featurePath = join(sddPath, featureName)
              const info = await detectFeaturePhase(featurePath)
              const phase = phaseDisplay(info.phase, info.phaseName)

              const stats: string[] = []
              if (info.taskCount > 0) stats.push(`${info.taskCount} tasks`)
              if (info.planCount > 0) stats.push(`${info.planCount} plans`)
              if (info.resultCount > 0) {
                const passLabel = info.allPassed ? pc.green('all passed') : pc.yellow(`${info.resultCount} evaluated`)
                stats.push(passLabel)
              }
              if (info.hasCodeReview) stats.push(pc.magenta('reviewed'))

              const statsStr = stats.length > 0 ? pc.gray(` (${stats.join(', ')})`) : ''
              logger.plain(`  ${pc.bold(featureName)}  ${phase}${statsStr}`)
            }

            logger.newline()
            logger.dim(`${features.length} feature(s)`)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`SDD list failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── sdd status ────────────────────────────────────────
      .command(
        'status [feature-name]',
        'Show detailed status of an SDD feature',
        (y) =>
          y.positional('feature-name', {
            type: 'string',
            description: 'Feature name (lists all if omitted)',
          }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
            }

            const aiDir = config.aiDir || '.ai'
            await requireSddInit(projectRoot, aiDir)

            const sddPath = join(projectRoot, aiDir, 'sdd')
            const featureName = argv['feature-name'] as string | undefined

            if (!featureName) {
              // Show overall SDD status
              logger.title(`dotai sdd status — v${VERSION}`)
              logger.newline()

              const sddConfig = getSddConfig(config)
              if (sddConfig.enabled) {
                logger.success('SDD Toolkit: initialized')
                if (sddConfig.initializedAt) {
                  logger.dim(`  Initialized at: ${sddConfig.initializedAt}`)
                }
              } else {
                logger.dim('SDD Toolkit: not initialized')
              }

              const features = await listFeatures(sddPath)
              logger.info(`${features.length} feature(s)`)

              // Show skill health
              const { SDD_SKILLS } = await import('../core/sdd-scaffold')
              let missingSkills = 0
              for (const skill of SDD_SKILLS) {
                const skillPath = join(projectRoot, aiDir, 'skills', skill.dirName, 'SKILL.md')
                if (!(await pathExists(skillPath))) {
                  missingSkills++
                }
              }
              if (missingSkills > 0) {
                logger.warn(`${missingSkills} skill file(s) missing — run \`dotai sdd init --force\` to restore`)
              } else {
                logger.success('All 8 skill files present')
              }

              return
            }

            // Show detailed status for a specific feature
            const featurePath = join(sddPath, featureName)
            if (!(await pathExists(featurePath))) {
              logger.error(`Feature '${featureName}' not found at ${aiDir}/sdd/${featureName}/`)
              process.exit(1)
            }

            logger.title(`dotai sdd status — ${featureName}`)
            logger.newline()

            const info = await detectFeaturePhase(featurePath)

            // Phase checklist
            const phases = [
              { num: 1, name: 'Initiate', desc: 'idea.md written' },
              { num: 2, name: 'Specify', desc: 'requirements.md generated' },
              { num: 3, name: 'Decompose', desc: 'tasks/ populated' },
              { num: 4, name: 'Plan', desc: 'plans/ + evaluation/ generated' },
              { num: 5, name: 'Implement', desc: 'code written' },
              { num: 6, name: 'Evaluate', desc: 'all tasks evaluated' },
              { num: 7, name: 'Review', desc: 'code-review.md created' },
              { num: 8, name: 'Context-sync', desc: 'knowledge updated' },
            ]

            for (const p of phases) {
              const done = info.phase >= p.num
              const current = info.phase === p.num
              const icon = done ? pc.green('✓') : (current ? pc.yellow('→') : pc.gray('○'))
              const label = current ? pc.bold(pc.white(`Phase ${p.num}: ${p.name}`)) : (done ? `Phase ${p.num}: ${p.name}` : pc.gray(`Phase ${p.num}: ${p.name}`))
              const desc = pc.gray(` — ${p.desc}`)
              logger.plain(`  ${icon} ${label}${done || current ? desc : ''}`)
            }

            logger.newline()

            // Stats
            if (info.taskCount > 0) logger.info(`Tasks: ${info.taskCount}`)
            if (info.planCount > 0) logger.info(`Plans: ${info.planCount}`)
            if (info.evaluationCount > 0) logger.info(`Evaluations: ${info.evaluationCount}`)
            if (info.resultCount > 0) {
              const passStatus = info.allPassed ? pc.green('all passed') : pc.yellow(`${info.resultCount}/${info.taskCount} evaluated`)
              logger.info(`Results: ${passStatus}`)
            }
            if (info.hasCodeReview) logger.info(`Code Review: ${pc.green('complete')}`)

            // Next action
            logger.newline()
            if (info.phase < 8) {
              const nextPhase = phases[info.phase] // phases is 0-indexed, info.phase is current
              if (nextPhase) {
                logger.info(`Next: Phase ${nextPhase.num} (${nextPhase.name})`)
              }
            } else {
              logger.success('Feature complete!')
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`SDD status failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai sdd --help` for usage.')
      .strict(),

  handler: async () => {
    // Subcommands handle everything
  },
}
