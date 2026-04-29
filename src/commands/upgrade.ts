import type { CommandModule } from 'yargs'
import { join, dirname } from 'path'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot } from '../core/config'
import { getScaffoldTemplateFiles, getTemplateContent } from '../core/scaffold'
import { pathExists, readTextFile, writeTextFile, ensureDir } from '../utils/fs'
import { VERSION } from '../version'
import pc from 'picocolors'
import { basename } from 'path'
import { unlink, rmdir, readdir } from 'fs/promises'

/**
 * Files that are pure reference documentation and safe to auto-overwrite.
 * Users don't typically customize these — they describe dotai itself.
 */
const AUTO_UPDATE_FILES = new Set(['DOTAI.md'])

/**
 * Files that existed in previous scaffold versions but are no longer generated.
 * These will be detected and removed during upgrade.
 *
 * Each entry is a relative path within the .ai/ directory.
 * Add entries here whenever template files are removed across versions.
 */
const STALE_SCAFFOLD_FILES: string[] = [
  // v3.1.0: knowledge CLI was simplified — scan/hook/append removed.
  // The old knowledge init used to create these files via `dotai knowledge init`.
  // They are no longer part of the scaffold but may remain in upgraded projects.
  // Note: knowledge/ skeleton files (INDEX.md, patterns.md, gotchas.md, changelog.md)
  // are still active — only listing files that were fully removed.
]

interface UpgradeArgs {
  'dry-run'?: boolean
  force?: boolean
}

export const upgradeCommand: CommandModule<{}, UpgradeArgs> = {
  command: 'upgrade',
  describe: 'Update .ai/ scaffold files to the latest dotai templates',
  builder: (yargs) =>
    yargs
      .option('dry-run', {
        type: 'boolean',
        description: 'Preview changes without modifying any files',
      })
      .option('force', {
        type: 'boolean',
        description: 'Overwrite ALL files with latest templates (destructive)',
      }),

  handler: async (argv) => {
    try {
      const projectRoot = (await findProjectRoot()) || process.cwd()
      const config = await readConfig(projectRoot)

      if (!config) {
        logger.error('No .dotai.json found. Run `dotai init` first.')
        process.exit(1)
      }

      const aiDir = config.aiDir || '.ai'
      const aiPath = join(projectRoot, aiDir)

      if (!(await pathExists(aiPath))) {
        logger.error(`${aiDir}/ directory not found. Run \`dotai init\` first.`)
        process.exit(1)
      }

      const dryRun = argv['dry-run'] || false
      const force = argv.force || false
      const prevVersion = config.scaffoldVersion || '0.0.0'

      logger.title(`dotai upgrade — v${VERSION}`)
      logger.newline()

      if (prevVersion === '0.0.0') {
        logger.dim(`Scaffold version: not tracked (pre-upgrade project)`)
      } else {
        logger.dim(`Scaffold version: ${prevVersion} → ${VERSION}`)
      }

      if (dryRun) {
        logger.info('[DRY RUN] No files will be modified.')
      }
      logger.newline()

      // Generate all templates for the current version
      const vars = {
        projectName: basename(projectRoot),
        projectDescription: '',
        projectRoot,
      }
      const templateFiles = getScaffoldTemplateFiles(config.tools)

      // Build set of current template paths for stale detection
      const currentTemplatePaths = new Set(templateFiles.map((f) => f.relPath))

      // Categorize each file
      const results: {
        status: 'new' | 'current' | 'auto-update' | 'review' | 'force-update'
        relPath: string
      }[] = []

      let newCount = 0
      let currentCount = 0
      let autoUpdateCount = 0
      let reviewCount = 0
      let forceUpdateCount = 0

      for (const file of templateFiles) {
        const filePath = join(aiPath, file.relPath)
        const latestContent = getTemplateContent(file.templateName, vars)

        if (!(await pathExists(filePath))) {
          // File doesn't exist — create it
          results.push({ status: 'new', relPath: file.relPath })
          newCount++

          if (!dryRun) {
            await ensureDir(dirname(filePath))
            await writeTextFile(filePath, latestContent)
          }
          continue
        }

        // File exists — compare content
        const currentContent = await readTextFile(filePath)
        const isIdentical = currentContent.trim() === latestContent.trim()

        if (isIdentical) {
          results.push({ status: 'current', relPath: file.relPath })
          currentCount++
          continue
        }

        // Content differs
        if (force) {
          // --force: overwrite everything
          results.push({ status: 'force-update', relPath: file.relPath })
          forceUpdateCount++

          if (!dryRun) {
            await writeTextFile(filePath, latestContent)
          }
          continue
        }

        if (AUTO_UPDATE_FILES.has(file.relPath)) {
          // Safe to auto-update (reference docs)
          results.push({ status: 'auto-update', relPath: file.relPath })
          autoUpdateCount++

          if (!dryRun) {
            await writeTextFile(filePath, latestContent)
          }
          continue
        }

        // User-modified file — save latest to _upgrade/ for manual review
        results.push({ status: 'review', relPath: file.relPath })
        reviewCount++

        if (!dryRun) {
          const upgradePath = join(aiPath, '_upgrade', file.relPath)
          await ensureDir(dirname(upgradePath))
          await writeTextFile(upgradePath, latestContent)
        }
      }

      // --- Stale file removal ---
      // Check for files that are no longer part of the current scaffold
      let staleCount = 0
      const staleRemoved: string[] = []

      for (const stalePath of STALE_SCAFFOLD_FILES) {
        const fullPath = join(aiPath, stalePath)
        if (await pathExists(fullPath)) {
          staleRemoved.push(stalePath)
          staleCount++

          if (!dryRun) {
            await unlink(fullPath)

            // Try to remove parent dir if it's now empty
            try {
              const parentDir = dirname(fullPath)
              const remaining = await readdir(parentDir)
              if (remaining.length === 0) {
                await rmdir(parentDir)
              }
            } catch {
              // Ignore — parent dir may not be empty or may not exist
            }
          }
        }
      }

      // Also detect any files in scaffold directories that are NOT in the
      // current template set. This catches user files we won't touch, but
      // warns about scaffold-generated files that may be obsolete.
      // We only scan well-known scaffold subdirs, not user-created ones.
      const scaffoldDirs = ['commands', 'commands-gemini', 'rules', 'settings', 'knowledge']
      for (const dir of scaffoldDirs) {
        const dirPath = join(aiPath, dir)
        if (!(await pathExists(dirPath))) continue

        try {
          const entries = await readdir(dirPath)
          for (const entry of entries) {
            const relPath = `${dir}/${entry}`
            // Skip if it's a known current template or already in stale list
            if (currentTemplatePaths.has(relPath)) continue
            if (STALE_SCAFFOLD_FILES.includes(relPath)) continue
            // Skip directories (modules/, decisions/, etc.)
            if (entry.indexOf('.') === -1) continue
            // This is an unrecognized file — could be user-created or from old version
            // We don't auto-delete these, just note them silently
          }
        } catch {
          // Ignore read errors
        }
      }

      // Print results
      for (const r of results) {
        switch (r.status) {
          case 'new':
            logger.plain(`  ${pc.green('+')} ${pc.green(r.relPath)}  ${pc.dim('— created')}`)
            break
          case 'current':
            // Don't print current files to reduce noise
            break
          case 'auto-update':
            logger.plain(`  ${pc.cyan('↑')} ${pc.cyan(r.relPath)}  ${pc.dim('— auto-updated')}`)
            break
          case 'review':
            logger.plain(`  ${pc.yellow('!')} ${pc.yellow(r.relPath)}  ${pc.dim(`— latest saved to ${aiDir}/_upgrade/${r.relPath}`)}`)
            break
          case 'force-update':
            logger.plain(`  ${pc.red('⇑')} ${pc.red(r.relPath)}  ${pc.dim('— overwritten (--force)')}`)
            break
        }
      }

      // Print stale removals
      for (const s of staleRemoved) {
        logger.plain(`  ${pc.red('−')} ${pc.red(s)}  ${pc.dim('— removed (obsolete)')}`)
      }

      // Summary
      logger.newline()

      if (currentCount > 0) {
        logger.dim(`${currentCount} file(s) already up to date`)
      }
      if (newCount > 0) {
        logger.success(`${newCount} file(s) created`)
      }
      if (autoUpdateCount > 0) {
        logger.success(`${autoUpdateCount} file(s) auto-updated`)
      }
      if (forceUpdateCount > 0) {
        logger.warn(`${forceUpdateCount} file(s) overwritten (--force)`)
      }
      if (staleCount > 0) {
        logger.success(`${staleCount} stale file(s) removed`)
      }
      if (reviewCount > 0) {
        logger.warn(`${reviewCount} file(s) need manual review`)
        logger.newline()
        logger.info('Review files saved to:')
        logger.plain(`  ${aiDir}/_upgrade/`)
        logger.newline()
        logger.dim('Compare with your current files:')
        logger.dim(`  diff ${aiDir}/<file> ${aiDir}/_upgrade/<file>`)
        logger.dim(`After merging, delete ${aiDir}/_upgrade/`)
      }

      if (newCount === 0 && autoUpdateCount === 0 && reviewCount === 0 && forceUpdateCount === 0 && staleCount === 0) {
        logger.success('All scaffold files are up to date!')
      }

      // Update scaffoldVersion
      if (!dryRun) {
        config.scaffoldVersion = VERSION
        config.version = VERSION
        await writeConfig(projectRoot, config)
        logger.newline()
        logger.dim(`scaffoldVersion updated to ${VERSION}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Upgrade failed: ${message}`)
      process.exit(1)
    }
  },
}
