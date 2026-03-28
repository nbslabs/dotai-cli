import { join } from 'path'
import { readJsonFile, writeJsonFile, pathExists } from '../utils/fs'

export interface ToolLinkState {
  linked: boolean
  linkedAt?: string
}

export interface DotAiConfig {
  version: string
  tools: string[]
  aiDir: string
  links: Record<string, ToolLinkState>
}

const CONFIG_FILE = '.dotai.json'

export function getConfigPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_FILE)
}

export async function readConfig(projectRoot: string): Promise<DotAiConfig | null> {
  const configPath = getConfigPath(projectRoot)
  try {
    return await readJsonFile<DotAiConfig>(configPath)
  } catch {
    return null
  }
}

export async function writeConfig(projectRoot: string, config: DotAiConfig): Promise<void> {
  const configPath = getConfigPath(projectRoot)
  await writeJsonFile(configPath, config)
}

export function createDefaultConfig(tools: string[], aiDir = '.ai'): DotAiConfig {
  const links: Record<string, ToolLinkState> = {}
  for (const tool of tools) {
    links[tool] = { linked: false }
  }
  return {
    version: '1.0.0',
    tools,
    aiDir,
    links,
  }
}

export function markToolLinked(config: DotAiConfig, toolId: string): void {
  config.links[toolId] = {
    linked: true,
    linkedAt: new Date().toISOString(),
  }
}

export function markToolUnlinked(config: DotAiConfig, toolId: string): void {
  config.links[toolId] = {
    linked: false,
  }
}

/**
 * Walk up the directory tree looking for .dotai.json or .git.
 * Returns the directory containing .dotai.json if found, otherwise the .git root.
 */
export async function findProjectRoot(startDir?: string): Promise<string | null> {
  let dir = startDir || process.cwd()
  const root = '/'

  while (true) {
    // Check for .dotai.json first
    if (await pathExists(join(dir, CONFIG_FILE))) {
      return dir
    }

    // Check for .git as fallback root
    if (await pathExists(join(dir, '.git'))) {
      return dir
    }

    const parent = join(dir, '..')
    if (parent === dir || dir === root) {
      break
    }
    dir = parent
  }

  // If nothing found, use cwd
  return process.cwd()
}
