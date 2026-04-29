import { readdir, readFile, appendFile, writeFile, stat, mkdir } from 'fs/promises'
import { join, relative } from 'path'
import { createInterface } from 'readline'
import { pathExists } from '../../utils/fs'

interface McpRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id?: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

const TOOLS_MANIFEST = {
  tools: [
    {
      name: 'knowledge_query',
      description: 'Search the codebase knowledge base for information about a topic, module, or concept',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'What you want to know about the codebase' },
        },
        required: ['question'],
      },
    },
    {
      name: 'knowledge_get_module',
      description: 'Get the full knowledge summary for a specific module or directory',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Module name as shown in INDEX.md' },
        },
        required: ['name'],
      },
    },
    {
      name: 'knowledge_recent_changes',
      description: 'Get recent codebase changes from the knowledge changelog',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of changelog entries to return (default 10)' },
        },
      },
    },
    {
      name: 'knowledge_list_modules',
      description: 'List all modules in the knowledge base with a one-line summary',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'knowledge_append',
      description: 'Persist a discovery or finding to the knowledge base so it survives across sessions. Use this whenever you discover something non-obvious about the codebase - gotchas, patterns, or module-specific insights.',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['gotchas', 'patterns'],
            description: 'Which knowledge file to append to. Use "gotchas" for edge cases, bugs, and never-do rules. Use "patterns" for recurring code patterns.',
          },
          module: {
            type: 'string',
            description: 'If the finding is specific to a module, provide the module name (as shown in INDEX.md). Overrides target.',
          },
          finding: {
            type: 'string',
            description: 'The discovery to persist. Be specific: include file names, function names, and explain WHY. Keep under 3 sentences.',
          },
          agent: {
            type: 'string',
            description: 'Who discovered this (e.g. "claude", "gemini", "human")',
          },
        },
        required: ['finding'],
      },
    },
    {
      name: 'knowledge_explore',
      description: 'Read source files from the project so you can perform deep analysis. Returns file paths and contents for the specified directory. Use this to understand code deeply, then call knowledge_append to persist your findings.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative directory path to explore (e.g. "src/core", "src/api"). Defaults to project root if not specified.',
          },
          extensions: {
            type: 'string',
            description: 'Comma-separated file extensions to include (e.g. "ts,js,py"). Defaults to all recognized source files.',
          },
          maxFiles: {
            type: 'number',
            description: 'Maximum number of files to return (default: 15). Each file is truncated to 200 lines.',
          },
        },
      },
    },
    {
      name: 'knowledge_populate_ai_md',
      description: 'Update the project-specific sections of AI.md (Project Overview, Architecture, Tech Stack, Key Commands, Important Constraints, Common Pitfalls) while preserving all dotai instruction sections. First use knowledge_explore to understand the codebase, then call this tool with your composed content.',
      inputSchema: {
        type: 'object',
        properties: {
          projectOverview: {
            type: 'string',
            description: 'Content for the "Project Overview" section. Describe what the project does.',
          },
          architecture: {
            type: 'string',
            description: 'Content for the "Architecture" section. List directories and their purposes.',
          },
          techStack: {
            type: 'string',
            description: 'Content for the "Tech Stack" section. List technologies with versions.',
          },
          keyCommands: {
            type: 'string',
            description: 'Content for the "Key Commands" section. Use markdown table format.',
          },
          constraints: {
            type: 'string',
            description: 'Content for the "Important Constraints" section. List hard rules.',
          },
          pitfalls: {
            type: 'string',
            description: 'Content for the "Common Pitfalls" section. List gotchas.',
          },
        },
      },
    },
  ],
}

export class KnowledgeMcpServer {
  constructor(
    private knowledgePath: string,
    private projectRoot: string = join(knowledgePath, '..', '..'),
    private aiDir: string = '.ai'
  ) {}

  /**
   * Start listening on stdin, writing to stdout (JSON-RPC 2.0).
   */
  async start(): Promise<void> {
    const rl = createInterface({
      input: process.stdin,
      terminal: false,
    })

    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let req: McpRequest
      try {
        req = JSON.parse(trimmed) as McpRequest
      } catch {
        this.writeResponse({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        })
        continue
      }

      const response = await this.handleRequest(req)
      if (response) {
        this.writeResponse(response)
      }
    }
  }

  /**
   * Handle a JSON-RPC request object.
   */
  private async handleRequest(req: McpRequest): Promise<McpResponse | null> {
    try {
      switch (req.method) {
        case 'initialize':
          return this.makeResult(req.id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'dotai-knowledge', version: '2.0.0' },
          })

        case 'tools/list':
          return this.makeResult(req.id, TOOLS_MANIFEST)

        case 'tools/call':
          return await this.handleToolCall(req)

        case 'notifications/initialized':
          // Notifications have no id and must NOT receive a response per JSON-RPC 2.0
          return null

        default:
          // All notifications (no id) must not get a response
          if (req.method.startsWith('notifications/') || req.id === undefined) {
            return null
          }
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32603, message: `Internal error: ${message}` },
      }
    }
  }

  private async handleToolCall(req: McpRequest): Promise<McpResponse> {
    const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined
    const toolName = params?.name
    const args = params?.arguments ?? {}

    let content: string

    switch (toolName) {
      case 'knowledge_query':
        content = await this.toolQuery(String(args.question ?? ''))
        break
      case 'knowledge_get_module':
        content = await this.toolGetModule(String(args.name ?? ''))
        break
      case 'knowledge_recent_changes':
        content = await this.toolRecentChanges(Number(args.limit) || 10)
        break
      case 'knowledge_list_modules':
        content = await this.toolListModules()
        break
      case 'knowledge_append':
        content = await this.toolAppend(
          String(args.finding ?? ''),
          (args.target as string) ?? 'gotchas',
          args.module as string | undefined,
          (args.agent as string) ?? 'agent'
        )
        break
      case 'knowledge_explore':
        content = await this.toolExplore(
          args.path as string | undefined,
          args.extensions as string | undefined,
          Number(args.maxFiles) || 15
        )
        break
      case 'knowledge_populate_ai_md':
        content = await this.toolPopulateAiMd(args as Record<string, string>)
        break
      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        }
    }

    return this.makeResult(req.id, {
      content: [{ type: 'text', text: content }],
    })
  }

  /**
   * Tool: knowledge_query - search knowledge files for keywords.
   */
  private async toolQuery(question: string): Promise<string> {
    const words = question.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return 'Please provide a search query.'

    const matches: { file: string; line: string }[] = []
    const mdFiles = await this.getAllMarkdownFiles(this.knowledgePath)

    for (const filePath of mdFiles) {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n')
      const relFile = relative(this.knowledgePath, filePath)

      for (const line of lines) {
        const lower = line.toLowerCase()
        if (words.some((w) => lower.includes(w))) {
          matches.push({ file: relFile, line: line.trim() })
          if (matches.length >= 20) break
        }
      }
      if (matches.length >= 20) break
    }

    if (matches.length === 0) {
      return `No results found for: "${question}"`
    }

    const results = matches.map((m) => `**${m.file}**: ${m.line}`).join('\n')
    return `## Search Results for "${question}"\n\n${results}`
  }

  /**
   * Tool: knowledge_get_module - return full module knowledge file.
   */
  private async toolGetModule(name: string): Promise<string> {
    const modulePath = join(this.knowledgePath, 'modules', `${name}.md`)
    if (!(await pathExists(modulePath))) {
      return `Module "${name}" not found. Run \`dotai knowledge list\` to see available modules.`
    }
    return await readFile(modulePath, 'utf-8')
  }

  /**
   * Tool: knowledge_recent_changes - return changelog entries.
   */
  private async toolRecentChanges(limit: number = 10): Promise<string> {
    const changelogPath = join(this.knowledgePath, 'changelog.md')
    if (!(await pathExists(changelogPath))) {
      return 'No changelog found. Run `dotai knowledge init` and then `/learn` to populate.'
    }

    const content = await readFile(changelogPath, 'utf-8')
    const entries = content.split(/^## /m).slice(1, limit + 1)
    if (entries.length === 0) {
      return 'Changelog is empty. Use `/learn` or `knowledge_append` to start tracking changes.'
    }

    return entries.map((e) => `## ${e.trim()}`).join('\n\n')
  }

  /**
   * Tool: knowledge_list_modules - list all available modules.
   */
  private async toolListModules(): Promise<string> {
    const modulesDir = join(this.knowledgePath, 'modules')
    if (!(await pathExists(modulesDir))) {
      return 'No modules indexed yet. Run `/learn` to populate the knowledge base.'
    }

    const entries = await readdir(modulesDir)
    const mdFiles = entries.filter((e) => e.endsWith('.md'))

    if (mdFiles.length === 0) {
      return 'No modules indexed yet.'
    }

    const lines = ['## Indexed Modules', '']
    for (const file of mdFiles) {
      const name = file.replace('.md', '')
      lines.push(`- **${name}** - see \`modules/${file}\``)
    }

    return lines.join('\n')
  }

  /**
   * Tool: knowledge_append - write a finding to the knowledge base.
   */
  private async toolAppend(
    finding: string,
    target: string,
    module?: string,
    agent: string = 'agent'
  ): Promise<string> {
    if (!finding.trim()) return 'Error: finding text is required.'

    const timestamp = new Date().toISOString()
    const entry = `\n### ${timestamp} - by ${agent}\n${finding.trim()}\n`

    let targetPath: string
    let targetName: string

    if (module) {
      targetPath = join(this.knowledgePath, 'modules', `${module}.md`)
      targetName = `modules/${module}.md`
    } else if (target === 'patterns') {
      targetPath = join(this.knowledgePath, 'patterns.md')
      targetName = 'patterns.md'
    } else {
      targetPath = join(this.knowledgePath, 'gotchas.md')
      targetName = 'gotchas.md'
    }

    if (!(await pathExists(targetPath))) {
      // Auto-create the file with a proper header
      const dir = join(targetPath, '..')
      if (!(await pathExists(dir))) {
        await mkdir(dir, { recursive: true })
      }

      let header = ''
      if (module) {
        header = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->\n# Module: ${module}\n\n> Auto-created by knowledge_append.\n`
      } else if (target === 'patterns') {
        header = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->\n# Patterns\n\n> Recurring code patterns.\n> Added by: AI agents (/learn command) and humans.\n`
      } else {
        header = `<!-- AUTO-GENERATED: safe to edit, do not delete header -->\n# Gotchas & Edge Cases\n\n> Things that are NOT obvious from reading the code.\n> Added by: AI agents (/learn command) and humans.\n`
      }

      await writeFile(targetPath, header, 'utf-8')
    }

    await appendFile(targetPath, entry, 'utf-8')
    return `OK: Finding appended to ${targetName}`
  }

  /**
   * Tool: knowledge_explore - read source files for agent deep analysis.
   */
  private async toolExplore(
    dirPath?: string,
    extensions?: string,
    maxFiles: number = 15
  ): Promise<string> {
    const SKIP_DIRS = new Set([
      'node_modules', '.git', 'dist', 'build', 'out', 'target',
      '.ai', '.claude', '.gemini', '.agents',
      '__pycache__', '.venv', 'venv', '.next', '.nuxt',
    ])

    const DEFAULT_EXTS = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.java', '.py', '.go', '.rs', '.rb', '.cs',
      '.json', '.yaml', '.yml', '.toml', '.md',
    ])

    const allowedExts = extensions
      ? new Set(extensions.split(',').map((e) => (e.startsWith('.') ? e : `.${e}`)))
      : DEFAULT_EXTS

    const targetDir = dirPath
      ? join(this.projectRoot, dirPath)
      : this.projectRoot

    if (!(await pathExists(targetDir))) {
      return `Error: directory not found: ${dirPath ?? this.projectRoot}`
    }

    const MAX_LINES = 200
    const files: { path: string; content: string }[] = []

    const collect = async (dir: string): Promise<void> => {
      if (files.length >= maxFiles) return
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (files.length >= maxFiles) return
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
          await collect(fullPath)
        } else if (entry.isFile()) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.'))
          if (!allowedExts.has(ext)) continue
          // Skip large files
          const fileStat = await stat(fullPath)
          if (fileStat.size > 100 * 1024) continue

          const content = await readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          const truncated = lines.length > MAX_LINES
            ? lines.slice(0, MAX_LINES).join('\n') + `\n... (truncated, ${lines.length} total lines)`
            : content

          files.push({
            path: relative(this.projectRoot, fullPath),
            content: truncated,
          })
        }
      }
    }

    await collect(targetDir)

    if (files.length === 0) {
      return `No source files found in: ${dirPath ?? '.'}`
    }

    const output = files.map((f) =>
      `## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
    ).join('\n\n')

    return `# Source Files (${files.length} files from ${dirPath ?? '.'})\n\n${output}\n\n---\n**AUTO-PERSIST REQUIRED**: You have just read source code. For each non-obvious finding (gotcha, pattern, constraint, hidden dependency) that is NOT already in the knowledge base, you MUST immediately call \`knowledge_append\` to persist it. Do not wait - persist each finding as you identify it.`
  }

  /**
   * Tool: knowledge_populate_ai_md - update AI.md project sections preserving dotai instructions.
   */
  private async toolPopulateAiMd(sections: Record<string, string>): Promise<string> {
    const aiMdPath = join(this.projectRoot, this.aiDir, 'AI.md')

    if (!(await pathExists(aiMdPath))) {
      return 'Error: AI.md not found. Run `dotai init` first.'
    }

    const existing = await readFile(aiMdPath, 'utf-8')

    // Section mappings: parameter name -> heading in AI.md
    const sectionMap: Record<string, string> = {
      projectOverview: '## Project Overview',
      architecture: '## Architecture',
      techStack: '## Tech Stack',
      codingConventions: '## Coding Conventions',
      keyCommands: '## Key Commands',
      constraints: '## Important Constraints',
      pitfalls: '## Common Pitfalls',
    }

    let updated = existing

    for (const [key, heading] of Object.entries(sectionMap)) {
      const value = sections[key]
      if (!value || !value.trim()) continue

      // Find the section and replace its content (up to the next ## heading)
      const headingIdx = updated.indexOf(heading)
      if (headingIdx === -1) continue

      // Find the next ## heading after this one
      const afterHeading = headingIdx + heading.length
      const nextHeadingMatch = updated.substring(afterHeading).match(/\n## /)
      const nextHeadingIdx = nextHeadingMatch
        ? afterHeading + (nextHeadingMatch.index ?? updated.length)
        : updated.length

      // Replace the section content
      updated = updated.substring(0, afterHeading) + '\n\n' + value.trim() + '\n\n' + updated.substring(nextHeadingIdx)
    }

    await writeFile(aiMdPath, updated, 'utf-8')
    const changedSections = Object.keys(sections).filter((k) => sections[k]?.trim())
    return `OK: Updated AI.md - sections modified: ${changedSections.join(', ')}`
  }

  private makeResult(id: number | string | undefined, result: unknown): McpResponse {
    return { jsonrpc: '2.0', id: id ?? null, result }
  }

  private writeResponse(response: McpResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n')
  }

  /**
   * Recursively find all .md files under a directory.
   */
  private async getAllMarkdownFiles(dirPath: string): Promise<string[]> {
    const results: string[] = []
    if (!(await pathExists(dirPath))) return results

    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const subFiles = await this.getAllMarkdownFiles(fullPath)
        results.push(...subFiles)
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }

    return results
  }
}
