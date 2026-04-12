export type LinkStrategy =
  | { type: 'dir-symlink' }
  | { type: 'file-symlink' }
  | { type: 'dir-junction' }

export interface ToolLink {
  source: string       // relative to .ai/
  target: string       // relative to project root (the tool's expected path)
  strategy: LinkStrategy
  required: boolean    // if true, init always creates this even if source missing
  description: string
}

export interface ToolDefinition {
  id: string
  name: string
  dirName: string      // the native dir name (e.g. ".claude")
  docsUrl: string
  links: ToolLink[]
  gitignore: string[]  // entries to add to .gitignore
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    dirName: '.claude',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    links: [
      {
        source: 'AI.md',
        target: 'CLAUDE.md',
        strategy: { type: 'file-symlink' },
        required: true,
        description: 'Claude Code instructions file (→ AI.md)',
      },
      {
        source: 'settings/claude.json',
        target: '.claude/settings.json',
        strategy: { type: 'file-symlink' },
        required: false,
        description: 'Claude Code settings',
      },
      {
        source: 'commands',
        target: '.claude/commands',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Claude custom slash commands',
      },
      {
        source: 'skills',
        target: '.claude/skills',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Claude skill packages',
      },
      {
        source: 'knowledge',
        target: '.claude/knowledge',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Persistent codebase knowledge base',
      },
    ],
    gitignore: ['.claude/', 'CLAUDE.md'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    dirName: '.gemini',
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
    links: [
      {
        source: 'AI.md',
        target: 'GEMINI.md',
        strategy: { type: 'file-symlink' },
        required: true,
        description: 'Gemini CLI context file (→ AI.md)',
      },
      {
        source: 'settings/gemini.json',
        target: '.gemini/settings.json',
        strategy: { type: 'file-symlink' },
        required: false,
        description: 'Gemini CLI settings',
      },
      {
        source: 'commands-gemini',
        target: '.gemini/commands',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Gemini custom commands (.toml format)',
      },
      {
        source: 'skills',
        target: '.gemini/skills',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Gemini CLI skill packages',
      },
      {
        source: 'ignore/.aiignore',
        target: '.geminiignore',
        strategy: { type: 'file-symlink' },
        required: false,
        description: 'Gemini ignore file',
      },
      {
        source: 'knowledge',
        target: '.gemini/knowledge',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Persistent codebase knowledge base',
      },
    ],
    gitignore: ['.gemini/', 'GEMINI.md', '.geminiignore'],
  },

  {
    id: 'copilot',
    name: 'GitHub Copilot',
    dirName: '.github',
    docsUrl: 'https://docs.github.com/en/copilot',
    links: [
      {
        source: 'AI.md',
        target: '.github/copilot-instructions.md',
        strategy: { type: 'file-symlink' },
        required: true,
        description: 'Copilot instructions file (→ AI.md)',
      },
      {
        source: 'instructions',
        target: '.github/instructions',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Copilot path-specific instructions',
      },
      {
        source: 'prompts',
        target: '.github/prompts',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Copilot prompt files',
      },
      {
        source: 'skills',
        target: '.github/skills',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Copilot skill packages',
      },
      {
        source: 'knowledge',
        target: '.github/knowledge',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Persistent codebase knowledge base',
      },
    ],
    gitignore: ['.github/knowledge'],
  },

  {
    id: 'antigravity',
    name: 'Antigravity',
    dirName: '.gemini',
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
    links: [
      {
        source: 'AI.md',
        target: 'GEMINI.md',
        strategy: { type: 'file-symlink' },
        required: true,
        description: 'Antigravity instructions file (→ AI.md)',
      },
      {
        source: 'AI.md',
        target: 'AGENTS.md',
        strategy: { type: 'file-symlink' },
        required: false,
        description: 'Antigravity AGENTS.md cross-tool standard (→ AI.md)',
      },
      {
        source: 'settings/gemini.json',
        target: '.gemini/settings.json',
        strategy: { type: 'file-symlink' },
        required: false,
        description: 'Antigravity settings',
      },
      {
        source: 'rules',
        target: '.gemini/rules',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Antigravity rules directory',
      },
      {
        source: 'workflows',
        target: '.agents/workflows',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Antigravity workflows directory',
      },
      {
        source: 'skills',
        target: '.agents/skills',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Antigravity skill packages',
      },
      {
        source: 'knowledge',
        target: '.gemini/knowledge',
        strategy: { type: 'dir-symlink' },
        required: false,
        description: 'Persistent codebase knowledge base',
      },
    ],
    gitignore: ['.agents/', 'AGENTS.md'],
  },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id)
}

export function getAllToolIds(): string[] {
  return TOOL_REGISTRY.map((t) => t.id)
}

export function isValidToolId(id: string): boolean {
  return TOOL_REGISTRY.some((t) => t.id === id)
}

export function getToolChoices(): { name: string; value: string; checked: boolean }[] {
  return TOOL_REGISTRY.map((t) => ({
    name: t.name,
    value: t.id,
    checked: true,
  }))
}

/**
 * Get all gitignore entries needed for a set of tools.
 */
export function getGitignoreEntries(toolIds: string[]): string[] {
  const entries = new Set<string>()
  for (const id of toolIds) {
    const tool = getToolById(id)
    if (tool) {
      for (const entry of tool.gitignore) {
        entries.add(entry)
      }
    }
  }
  return Array.from(entries)
}
