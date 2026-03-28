import type { CommandModule } from 'yargs'
import { join } from 'path'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig } from '../core/config'
import { getToolById } from '../core/registry'
import { verifySymlink } from '../core/symlink'
import { pathExists } from '../utils/fs'

interface StatusArgs {
  json?: boolean
  tool?: string
}

interface ToolStatusInfo {
  id: string
  name: string
  status: 'linked' | 'broken' | 'partial' | 'skip'
  links: { target: string; source: string; status: string; message?: string }[]
}

export const statusCommand: CommandModule<{}, StatusArgs> = {
  command: 'status',
  describe: 'Show the current state of all symlinks',
  builder: (yargs) =>
    yargs
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON',
      })
      .option('tool', {
        type: 'string',
        description: 'Show status for one tool only',
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

      const toolIds = argv.tool ? [argv.tool] : config.tools
      const results: ToolStatusInfo[] = []

      for (const toolId of toolIds) {
        const tool = getToolById(toolId)
        if (!tool) {
          results.push({
            id: toolId,
            name: toolId,
            status: 'skip',
            links: [],
          })
          continue
        }

        const linkState = config.links[toolId]
        if (!linkState || (!linkState.linked && !argv.tool)) {
          results.push({
            id: tool.id,
            name: tool.name,
            status: 'skip',
            links: [{ target: '', source: '', status: 'not configured' }],
          })
          continue
        }

        const aiPath = join(projectRoot, config.aiDir)
        const linkResults: ToolStatusInfo['links'] = []
        let hasValid = false
        let hasBroken = false

        for (const link of tool.links) {
          const source = join(aiPath, link.source)
          const target = join(projectRoot, link.target)

          const status = await verifySymlink(target, source)

          switch (status.status) {
            case 'valid':
              linkResults.push({
                target: link.target,
                source: `${config.aiDir}/${link.source}`,
                status: '✓',
              })
              hasValid = true
              break
            case 'broken':
              linkResults.push({
                target: link.target,
                source: `${config.aiDir}/${link.source}`,
                status: '✗ broken',
                message: status.message,
              })
              hasBroken = true
              break
            case 'wrong-target':
              linkResults.push({
                target: link.target,
                source: `${config.aiDir}/${link.source}`,
                status: '✗ wrong target',
                message: status.message,
              })
              hasBroken = true
              break
            case 'not-symlink':
              linkResults.push({
                target: link.target,
                source: `${config.aiDir}/${link.source}`,
                status: '~ real file',
                message: 'Not a symlink',
              })
              hasBroken = true
              break
            case 'missing':
              // Only show missing if source exists (should be linked)
              if (await pathExists(source)) {
                linkResults.push({
                  target: link.target,
                  source: `${config.aiDir}/${link.source}`,
                  status: '✗ missing',
                  message: 'Symlink not created',
                })
                hasBroken = true
              }
              break
          }
        }

        let toolStatus: 'linked' | 'broken' | 'partial' | 'skip'
        if (hasBroken && hasValid) {
          toolStatus = 'partial'
        } else if (hasBroken) {
          toolStatus = 'broken'
        } else if (hasValid) {
          toolStatus = 'linked'
        } else {
          toolStatus = 'skip'
        }

        results.push({
          id: tool.id,
          name: tool.name,
          status: toolStatus,
          links: linkResults,
        })
      }

      if (argv.json) {
        console.log(JSON.stringify(results, null, 2))
        return
      }

      // Pretty print
      logger.title(`dotai status`)
      logger.newline()

      let linkedCount = 0
      let brokenCount = 0
      let skippedCount = 0

      for (const tool of results) {
        const statusIcon =
          tool.status === 'linked'
            ? pc.green('✓ linked')
            : tool.status === 'broken'
              ? pc.red('✗ broken')
              : tool.status === 'partial'
                ? pc.yellow('~ partial')
                : pc.gray('— skip')

        logger.plain(`${pc.bold(tool.name.padEnd(18))} ${statusIcon}`)

        for (const link of tool.links) {
          if (link.target) {
            const arrow = `${link.target.padEnd(40)} → ${link.source}`
            if (link.status === '✓') {
              logger.dim(`  ${arrow}`)
            } else {
              logger.plain(`  ${pc.yellow(link.status)} ${arrow}`)
              if (link.message) {
                logger.dim(`    ↳ ${link.message}`)
              }
            }
          } else {
            logger.dim(`  ${link.status}`)
          }
        }

        switch (tool.status) {
          case 'linked':
            linkedCount++
            break
          case 'broken':
          case 'partial':
            brokenCount++
            break
          case 'skip':
            skippedCount++
            break
        }

        logger.newline()
      }

      logger.dim(
        `${linkedCount} linked  ${brokenCount} broken  ${skippedCount} skipped`
      )

      if (brokenCount > 0) {
        logger.newline()
        logger.dim('Run `dotai doctor` to auto-fix broken links.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Status failed: ${message}`)
      process.exit(1)
    }
  },
}
