import type { CommandModule } from 'yargs'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig } from '../core/config'
import { TOOL_REGISTRY } from '../core/registry'

interface ListArgs {
  all?: boolean
  json?: boolean
}

export const listCommand: CommandModule<{}, ListArgs> = {
  command: 'list',
  describe: 'List all supported tools and their status',
  builder: (yargs) =>
    yargs
      .option('all', {
        type: 'boolean',
        description: 'Show all supported tools (including those not in project)',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON',
      }),

  handler: async (argv) => {
    try {
      const projectRoot = process.cwd()
      const config = await readConfig(projectRoot)
      const showAll = argv.all || !config

      const tools = showAll
        ? TOOL_REGISTRY
        : TOOL_REGISTRY.filter((t) => config!.tools.includes(t.id))

      if (argv.json) {
        const data = tools.map((t) => ({
          id: t.id,
          name: t.name,
          dirName: t.dirName,
          docsUrl: t.docsUrl,
          configured: config?.tools.includes(t.id) ?? false,
          linked: config?.links[t.id]?.linked ?? false,
        }))
        console.log(JSON.stringify(data, null, 2))
        return
      }

      logger.title('Supported AI coding tools:')
      logger.newline()

      // Table header
      const header = `  ${pc.bold('ID'.padEnd(12))}${pc.bold('Name'.padEnd(22))}${pc.bold('Config Dir'.padEnd(18))}${pc.bold('Docs')}`
      console.log(header)
      console.log(`  ${'─'.repeat(12)}${'─'.repeat(22)}${'─'.repeat(18)}${'─'.repeat(30)}`)

      for (const tool of tools) {
        const configured = config?.tools.includes(tool.id)
        const linked = config?.links[tool.id]?.linked

        let status = ''
        if (config) {
          if (linked) {
            status = pc.green(' ✓')
          } else if (configured) {
            status = pc.yellow(' ○')
          } else {
            status = pc.gray(' ·')
          }
        }

        console.log(
          `  ${tool.id.padEnd(12)}${tool.name.padEnd(22)}${tool.dirName.padEnd(18)}${pc.dim(tool.docsUrl)}${status}`
        )
      }

      logger.newline()

      if (config) {
        const configuredCount = config.tools.length
        const linkedCount = Object.values(config.links).filter((l) => l.linked).length
        logger.dim(`${configuredCount} configured, ${linkedCount} linked`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`List failed: ${message}`)
      process.exit(1)
    }
  },
}
