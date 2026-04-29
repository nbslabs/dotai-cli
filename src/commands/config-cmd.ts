import type { CommandModule } from 'yargs'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot } from '../core/config'

interface ConfigArgs {}

export const configCommand: CommandModule<{}, ConfigArgs> = {
  command: 'config <subcommand>',
  describe: 'View and modify .dotai.json settings',
  builder: (yargs) =>
    yargs
      .command(
        'get <key>',
        'Get a config value',
        (y) => y.positional('key', { type: 'string', description: 'Config key (e.g. "aiDir", "tools")', demandOption: true }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const key = argv.key as string
            const value = (config as unknown as Record<string, unknown>)[key]

            if (value === undefined) {
              logger.warn(`Key '${key}' not found in .dotai.json`)
              logger.dim(`Available keys: ${Object.keys(config).join(', ')}`)
            } else {
              console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
            }
          } catch (err: unknown) {
            logger.error(`Config get failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'set <key> <value>',
        'Set a config value',
        (y) =>
          y.positional('key', { type: 'string', description: 'Config key', demandOption: true })
           .positional('value', { type: 'string', description: 'Value to set', demandOption: true }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            const key = argv.key as string
            const rawValue = argv.value as string

            // Allowed keys for direct set
            const allowedKeys = ['aiDir', 'gitignore']
            if (!allowedKeys.includes(key)) {
              logger.error(`Cannot set '${key}'. Allowed keys: ${allowedKeys.join(', ')}`)
              logger.dim('Use `dotai add/remove` for tools, `dotai mcp add/remove` for MCP servers.')
              process.exit(1)
              return
            }

            // Parse value
            let value: unknown = rawValue
            if (rawValue === 'true') value = true
            else if (rawValue === 'false') value = false
            else if (/^\d+$/.test(rawValue)) value = parseInt(rawValue, 10)

            ;(config as unknown as Record<string, unknown>)[key] = value
            await writeConfig(projectRoot, config)
            logger.success(`Set ${key} = ${JSON.stringify(value)}`)
          } catch (err: unknown) {
            logger.error(`Config set failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .command(
        'show',
        'Show the full .dotai.json configuration',
        (y) => y,
        async () => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) { logger.error('No .dotai.json found. Run `dotai init` first.'); process.exit(1); return }

            logger.title('dotai configuration')
            logger.newline()
            console.log(JSON.stringify(config, null, 2))
          } catch (err: unknown) {
            logger.error(`Config show failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai config --help` for usage.')
      .strict(),

  handler: async () => {},
}
