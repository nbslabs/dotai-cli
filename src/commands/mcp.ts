import type { CommandModule } from 'yargs'
import { join } from 'path'
import pc from 'picocolors'
import { logger } from '../utils/logger'
import { readConfig, writeConfig, findProjectRoot } from '../core/config'
import { pathExists, readJsonFile, writeJsonFile, ensureDir } from '../utils/fs'
import { VERSION } from '../version'

interface McpArgs {
  // subcommand router
}

interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
}

interface SettingsFile {
  permissions?: Record<string, unknown>
  mcpServers?: Record<string, McpServerEntry>
  [key: string]: unknown
}

/**
 * Get all settings files and their MCP server configs.
 */
async function getSettingsFiles(
  projectRoot: string,
  aiDir: string,
  tools: string[]
): Promise<{ tool: string; path: string; settings: SettingsFile }[]> {
  const results: { tool: string; path: string; settings: SettingsFile }[] = []

  const settingsMap: Record<string, string> = {
    claude: 'settings/claude.json',
    gemini: 'settings/gemini.json',
    antigravity: 'settings/gemini.json',
    copilot: 'settings/copilot.json',
  }

  // Deduplicate by file path (gemini and antigravity share the same file)
  const seen = new Set<string>()

  for (const tool of tools) {
    const settingsRel = settingsMap[tool]
    if (!settingsRel || seen.has(settingsRel)) continue
    seen.add(settingsRel)

    const settingsPath = join(projectRoot, aiDir, settingsRel)
    if (await pathExists(settingsPath)) {
      try {
        const settings = await readJsonFile<SettingsFile>(settingsPath)
        results.push({ tool, path: settingsPath, settings })
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return results
}

/**
 * Ensure a settings file exists, creating it with defaults if needed.
 */
async function ensureSettingsFile(filePath: string): Promise<SettingsFile> {
  if (await pathExists(filePath)) {
    return readJsonFile<SettingsFile>(filePath)
  }
  const defaults: SettingsFile = { mcpServers: {} }
  await ensureDir(join(filePath, '..'))
  await writeJsonFile(filePath, defaults)
  return defaults
}

export const mcpCommand: CommandModule<{}, McpArgs> = {
  command: 'mcp <subcommand>',
  describe: 'Manage MCP server configurations across all enabled tools',
  builder: (yargs) =>
    yargs
      // ─── mcp add ────────────────────────────────────────────
      .command(
        'add <name>',
        'Add an MCP server to all enabled tool settings files',
        (y) =>
          y
            .positional('name', {
              type: 'string',
              description: 'MCP server name (e.g. "my-server")',
              demandOption: true,
            })
            .option('command', {
              type: 'string',
              description: 'Command to run the MCP server (e.g. "npx")',
              alias: 'c',
              demandOption: true,
            })
            .option('args', {
              type: 'string',
              description: 'Comma-separated args (e.g. "my-pkg,serve,--stdio")',
              alias: 'a',
            })
            .option('env', {
              type: 'string',
              description: 'Comma-separated KEY=VALUE env vars',
              alias: 'e',
            })
            .option('url', {
              type: 'string',
              description: 'URL for HTTP-based MCP server (instead of command)',
            })
            .option('tool', {
              type: 'string',
              description: 'Only add to this specific tool (claude, gemini, etc.)',
            }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
              return
            }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const tools = argv.tool ? [argv.tool] : config.tools

            logger.title(`dotai mcp add — ${name}`)
            logger.newline()

            // Build server entry
            const serverEntry: McpServerEntry = {
              command: argv.command!,
            }

            if (argv.args) {
              serverEntry.args = argv.args.split(',').map((a) => a.trim())
            }

            if (argv.env) {
              serverEntry.env = {}
              for (const pair of argv.env.split(',')) {
                const [key, ...rest] = pair.split('=')
                serverEntry.env[key.trim()] = rest.join('=').trim()
              }
            }

            if (argv.url) {
              serverEntry.url = argv.url
            }

            // Map tools to their settings files
            const settingsMap: Record<string, string> = {
              claude: 'settings/claude.json',
              gemini: 'settings/gemini.json',
              antigravity: 'settings/gemini.json',
              copilot: 'settings/copilot.json',
            }

            const seen = new Set<string>()
            let addedCount = 0

            for (const tool of tools) {
              const settingsRel = settingsMap[tool]
              if (!settingsRel || seen.has(settingsRel)) continue
              seen.add(settingsRel)

              const settingsPath = join(projectRoot, aiDir, settingsRel)
              const settings = await ensureSettingsFile(settingsPath)

              if (!settings.mcpServers) {
                settings.mcpServers = {}
              }

              if (settings.mcpServers[name]) {
                logger.warn(`MCP server '${name}' already exists in ${settingsRel} — overwriting`)
              }

              settings.mcpServers[name] = serverEntry
              await writeJsonFile(settingsPath, settings)
              logger.success(`Added '${name}' to ${settingsRel}`)
              addedCount++
            }

            if (addedCount === 0) {
              logger.warn('No settings files were updated. Check your configured tools.')
            } else {
              logger.newline()
              logger.success(`MCP server '${name}' added to ${addedCount} settings file(s)`)
              logger.dim('Run `dotai mcp list` to verify')
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`MCP add failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── mcp remove ─────────────────────────────────────────
      .command(
        'remove <name>',
        'Remove an MCP server from all tool settings files',
        (y) =>
          y
            .positional('name', {
              type: 'string',
              description: 'MCP server name to remove',
              demandOption: true,
            })
            .option('tool', {
              type: 'string',
              description: 'Only remove from this specific tool',
            }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
              return
            }

            const name = argv.name as string
            const aiDir = config.aiDir || '.ai'
            const tools = argv.tool ? [argv.tool] : config.tools

            logger.title(`dotai mcp remove — ${name}`)
            logger.newline()

            const settingsFiles = await getSettingsFiles(projectRoot, aiDir, tools)
            let removedCount = 0

            for (const { tool, path, settings } of settingsFiles) {
              if (settings.mcpServers && settings.mcpServers[name]) {
                delete settings.mcpServers[name]
                await writeJsonFile(path, settings)
                const relPath = path.replace(projectRoot + '/', '')
                logger.success(`Removed '${name}' from ${relPath}`)
                removedCount++
              }
            }

            if (removedCount === 0) {
              logger.warn(`MCP server '${name}' not found in any settings file.`)
            } else {
              logger.newline()
              logger.success(`Removed '${name}' from ${removedCount} settings file(s)`)
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`MCP remove failed: ${message}`)
            process.exit(1)
          }
        }
      )

      // ─── mcp list ───────────────────────────────────────────
      .command(
        'list',
        'List all configured MCP servers across tool settings',
        (y) =>
          y.option('json', {
            type: 'boolean',
            description: 'Output as JSON',
          }),
        async (argv) => {
          try {
            const projectRoot = (await findProjectRoot()) || process.cwd()
            const config = await readConfig(projectRoot)
            if (!config) {
              logger.error('No .dotai.json found. Run `dotai init` first.')
              process.exit(1)
              return
            }

            const aiDir = config.aiDir || '.ai'
            const settingsFiles = await getSettingsFiles(projectRoot, aiDir, config.tools)

            // Collect all MCP servers across files
            const allServers: {
              name: string
              command: string
              args?: string[]
              url?: string
              files: string[]
            }[] = []

            const serverMap = new Map<string, typeof allServers[0]>()

            for (const { path, settings } of settingsFiles) {
              if (!settings.mcpServers) continue
              const relPath = path.replace(projectRoot + '/', '')

              for (const [name, entry] of Object.entries(settings.mcpServers)) {
                if (serverMap.has(name)) {
                  serverMap.get(name)!.files.push(relPath)
                } else {
                  const server = {
                    name,
                    command: entry.command,
                    args: entry.args,
                    url: entry.url,
                    files: [relPath],
                  }
                  serverMap.set(name, server)
                  allServers.push(server)
                }
              }
            }

            if (argv.json) {
              console.log(JSON.stringify(allServers, null, 2))
              return
            }

            logger.title('MCP Servers')
            logger.newline()

            if (allServers.length === 0) {
              logger.dim('No MCP servers configured.')
              logger.dim('Run `dotai mcp add <name> --command <cmd>` to add one.')
              return
            }

            for (const server of allServers) {
              const cmdLine = server.args
                ? `${server.command} ${server.args.join(' ')}`
                : server.command

              logger.plain(`${pc.bold(server.name)}`)
              logger.dim(`  command: ${cmdLine}`)
              if (server.url) {
                logger.dim(`  url:     ${server.url}`)
              }
              logger.dim(`  files:   ${server.files.join(', ')}`)
              logger.newline()
            }

            logger.dim(`${allServers.length} MCP server(s) configured`)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`MCP list failed: ${message}`)
            process.exit(1)
          }
        }
      )
      .demandCommand(1, 'Specify a subcommand. Run `dotai mcp --help` for usage.')
      .strict(),

  handler: async () => {
    // Subcommands handle everything
  },
}
