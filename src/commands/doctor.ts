import type { CommandModule } from 'yargs'
import { join } from 'path'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, getSddConfig } from '../core/config'
import { getToolById, getGitignoreEntries } from '../core/registry'
import { verifySymlink, createSymlink, isSymlink } from '../core/symlink'
import { scaffoldAiDir, updateGitignore } from '../core/scaffold'
import { pathExists, dirExists, readTextFile } from '../utils/fs'
import { promptConfirm } from '../utils/prompt'
import { SDD_SKILLS, scaffoldSdd } from '../core/sdd-scaffold'

interface DoctorArgs {
  fix?: boolean
  tool?: string
  json?: boolean
}

interface DiagnosticIssue {
  tool: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  fix?: string
  fixable: boolean
}

export const doctorCommand: CommandModule<{}, DoctorArgs> = {
  command: 'doctor',
  describe: 'Diagnose and optionally auto-fix all problems',
  builder: (yargs) =>
    yargs
      .option('fix', {
        type: 'boolean',
        description: 'Auto-fix all fixable issues',
      })
      .option('tool', {
        type: 'string',
        description: 'Run doctor for one tool only',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON',
      }),

  handler: async (argv) => {
    try {
      const projectRoot = process.cwd()
      const autoFix = argv.fix || false
      const issues: DiagnosticIssue[] = []

      logger.title('dotai doctor')
      logger.newline()

      // Check 1: .ai/ directory exists
      const config = await readConfig(projectRoot)
      if (!config) {
        issues.push({
          tool: 'global',
          type: 'missing-config',
          severity: 'critical',
          message: '.dotai.json not found',
          fix: 'Run `dotai init` to initialize',
          fixable: false,
        })

        if (argv.json) {
          console.log(JSON.stringify(issues, null, 2))
        } else {
          logger.error('.dotai.json not found. Run `dotai init` to initialize.')
        }
        process.exit(1)
        return
      }

      const aiPath = join(projectRoot, config.aiDir)

      if (!(await dirExists(aiPath))) {
        issues.push({
          tool: 'global',
          type: 'missing-ai-dir',
          severity: 'critical',
          message: `${config.aiDir}/ directory not found`,
          fix: 'Run `dotai init` to recreate',
          fixable: true,
        })

        if (autoFix) {
          await scaffoldAiDir(projectRoot, {
            projectName: '',
            projectDescription: '',
            aiDir: config.aiDir,
            tools: config.tools,
          })
          logger.success(`Recreated ${config.aiDir}/ directory`)
        }
      }

      // Check each tool
      const toolIds = argv.tool ? [argv.tool] : config.tools
      let totalLinks = 0

      for (const toolId of toolIds) {
        const tool = getToolById(toolId)
        if (!tool) {
          issues.push({
            tool: toolId,
            type: 'stale-config',
            severity: 'warning',
            message: `Tool '${toolId}' in config but not in registry`,
            fixable: false,
          })
          continue
        }

        let toolHealthy = true

        for (const link of tool.links) {
          totalLinks++
          const source = join(aiPath, link.source)
          const target = join(projectRoot, link.target)

          // Check 3: Missing source files
          if (link.required && !(await pathExists(source))) {
            issues.push({
              tool: toolId,
              type: 'missing-source',
              severity: 'warning',
              message: `${config.aiDir}/${link.source} does not exist`,
              fix: `Create from template`,
              fixable: true,
            })
            toolHealthy = false

            if (autoFix) {
              await scaffoldAiDir(projectRoot, {
                projectName: '',
                projectDescription: '',
                aiDir: config.aiDir,
                tools: [toolId],
              })
              logger.success(`Created ${config.aiDir}/${link.source} from template`)
            }
            continue
          }

          // Check 4-6: Symlink state
          if (!(await pathExists(source))) {
            continue // Source doesn't exist, skip
          }

          const status = await verifySymlink(target, source)

          switch (status.status) {
            case 'valid':
              // Healthy
              break
            case 'broken':
              issues.push({
                tool: toolId,
                type: 'broken-symlink',
                severity: 'warning',
                message: `${link.target} → ${config.aiDir}/${link.source} (symlink target missing)`,
                fix: 'Re-create symlink',
                fixable: true,
              })
              toolHealthy = false

              if (autoFix) {
                await createSymlink(source, target, { force: true })
                logger.success(`Fixed ${link.target}`)
              }
              break
            case 'wrong-target':
              issues.push({
                tool: toolId,
                type: 'wrong-symlink-target',
                severity: 'warning',
                message: `${link.target} points to ${status.actualTarget} instead of ${config.aiDir}/${link.source}`,
                fix: 'Re-create symlink with correct target',
                fixable: true,
              })
              toolHealthy = false

              if (autoFix) {
                await createSymlink(source, target, { force: true })
                logger.success(`Fixed ${link.target}`)
              }
              break
            case 'not-symlink':
              issues.push({
                tool: toolId,
                type: 'real-file-blocking',
                severity: 'warning',
                message: `${link.target} is a real file/directory, not a symlink`,
                fix: 'Back up and replace with symlink',
                fixable: true,
              })
              toolHealthy = false

              if (autoFix) {
                const result = await createSymlink(source, target, { force: true, backup: true })
                if (result.status === 'backed-up-and-created') {
                  logger.success(`Backed up and linked ${link.target}`)
                }
              }
              break
            case 'missing':
              if (await pathExists(source)) {
                issues.push({
                  tool: toolId,
                  type: 'missing-symlink',
                  severity: 'warning',
                  message: `${link.target} symlink not created`,
                  fix: 'Create symlink',
                  fixable: true,
                })
                toolHealthy = false

                if (autoFix) {
                  await createSymlink(source, target)
                  logger.success(`Created ${link.target}`)
                }
              }
              break
          }
        }

        if (!autoFix) {
          if (toolHealthy) {
            logger.success(`${tool.id.padEnd(12)} All links healthy`)
          } else {
            const toolIssues = issues.filter((i) => i.tool === toolId)
            logger.error(`${tool.id.padEnd(12)} ${toolIssues.length} issue(s) found:`)
            for (const issue of toolIssues) {
              logger.plain(`    [${issue.type}] ${issue.message}`)
              if (issue.fix) {
                logger.dim(`      Fix: ${issue.fix}`)
              }
            }
          }
        }
      }

      // Check 9: Gitignore
      const gitignorePath = join(projectRoot, '.gitignore')
      if (await pathExists(gitignorePath)) {
        const content = await readTextFile(gitignorePath)
        const lines = new Set(content.split('\n').map((l) => l.trim()))
        const expected = getGitignoreEntries(config.tools)
        const missing = expected.filter((e) => !lines.has(e))

        if (missing.length > 0) {
          issues.push({
            tool: 'global',
            type: 'gitignore-missing',
            severity: 'info',
            message: `${missing.length} entries missing from .gitignore: ${missing.join(', ')}`,
            fix: 'Add entries to .gitignore',
            fixable: true,
          })

          if (autoFix) {
            await updateGitignore(projectRoot, missing)
            logger.success(`Updated .gitignore (+${missing.length} entries)`)
          }
        }
      }

      // Check 10: SDD Toolkit health
      const sddConfig = getSddConfig(config)
      const sddPath = join(aiPath, 'sdd')
      const sddDirExists = await pathExists(sddPath)

      if (sddConfig.enabled || sddDirExists) {
        // Check skill files
        let missingSkills = 0
        for (const skill of SDD_SKILLS) {
          const skillPath = join(aiPath, 'skills', skill.dirName, 'SKILL.md')
          if (!(await pathExists(skillPath))) {
            missingSkills++
            issues.push({
              tool: 'sdd',
              type: 'missing-skill',
              severity: 'warning',
              message: `SDD skill missing: skills/${skill.dirName}/SKILL.md`,
              fix: 'Restore via `dotai sdd init --force`',
              fixable: true,
            })
          }
        }

        if (autoFix && missingSkills > 0) {
          await scaffoldSdd(projectRoot, config.aiDir, { force: true })
          logger.success(`Restored ${missingSkills} missing SDD skill file(s)`)
        } else if (!autoFix) {
          if (missingSkills === 0 && sddDirExists) {
            logger.success('sdd'.padEnd(12) + ' All skill files present')
          } else if (missingSkills > 0) {
            logger.error('sdd'.padEnd(12) + ` ${missingSkills} skill file(s) missing`)
          }
        }

        // Check AI.md has SDD block
        const aiMdPath = join(aiPath, 'AI.md')
        if (await pathExists(aiMdPath)) {
          const aiMdContent = await readTextFile(aiMdPath)
          if (!aiMdContent.includes('## SDD Toolkit')) {
            issues.push({
              tool: 'sdd',
              type: 'ai-md-missing-sdd',
              severity: 'warning',
              message: 'AI.md is missing the SDD Toolkit instruction block',
              fix: 'Run `dotai sdd init --force` to add it',
              fixable: false,
            })
          }
        }

        // Check config vs directory consistency
        if (sddConfig.enabled && !sddDirExists) {
          issues.push({
            tool: 'sdd',
            type: 'sdd-config-dir-mismatch',
            severity: 'warning',
            message: 'SDD is enabled in config but .ai/sdd/ directory is missing',
            fix: 'Run `dotai sdd init` to recreate',
            fixable: false,
          })
        }
      }

      if (argv.json) {
        console.log(JSON.stringify(issues, null, 2))
        return
      }

      logger.newline()

      if (issues.length === 0) {
        logger.success('All checks passed! No issues found.')
      } else {
        const fixableCount = issues.filter((i) => i.fixable).length
        if (autoFix) {
          logger.success(`Fixed ${fixableCount} issue(s).`)
        } else {
          logger.plain(
            `${issues.length} issue(s) found. Run \`dotai doctor --fix\` to resolve automatically.`
          )
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Doctor failed: ${message}`)
      process.exit(1)
    }
  },
}
