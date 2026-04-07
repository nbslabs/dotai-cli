import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readFile, writeFile, unlink, chmod, access, constants } from 'fs/promises'
import { logger } from '../../utils/logger'

const exec = promisify(execFile)

const HOOK_SIGNATURE = '# dotai-hook-v3'

const HOOK_CONTENT = `#!/bin/sh
${HOOK_SIGNATURE}
# dotai knowledge auto-update hook
# Installed by: dotai knowledge hook install
# Remove with: dotai knowledge hook uninstall

# Re-entrancy guard: prevent infinite loop when amend triggers post-commit again
LOCK_FILE=".git/dotai-hook.lock"
if [ -f "$LOCK_FILE" ]; then
  exit 0
fi
trap 'rm -f "$LOCK_FILE"' EXIT
touch "$LOCK_FILE"

# Run knowledge update silently
if command -v dotai >/dev/null 2>&1; then
  dotai knowledge update --silent
else
  npx --no-install dotai knowledge update --silent 2>/dev/null || true
fi

# Stage knowledge changes and amend the commit (no message change)
git add .ai/knowledge/ 2>/dev/null
git diff --cached --quiet .ai/knowledge/ 2>/dev/null || \\
  git commit --amend --no-edit --no-verify 2>/dev/null || true
`

/**
 * Get the short hash of HEAD.
 */
export async function getCurrentCommitHash(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot })
    return stdout.trim() || null
  } catch {
    logger.dim('git not available — skipping commit hash')
    return null
  }
}

/**
 * Get the commit message of HEAD.
 */
export async function getCurrentCommitMessage(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['log', '-1', '--pretty=%s'], { cwd: projectRoot })
    return stdout.trim() || null
  } catch {
    logger.dim('git not available — skipping commit message')
    return null
  }
}

/**
 * Get list of files changed between two commits (or HEAD~1..HEAD).
 */
export async function getChangedFiles(
  projectRoot: string,
  fromRef: string = 'HEAD~1',
  toRef: string = 'HEAD'
): Promise<string[]> {
  try {
    const { stdout } = await exec(
      'git',
      ['diff', '--name-only', fromRef, toRef],
      { cwd: projectRoot }
    )
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    logger.dim('git not available — cannot determine changed files')
    return []
  }
}

/**
 * Get the path to the git hooks directory.
 */
function getHookPath(projectRoot: string): string {
  return join(projectRoot, '.git', 'hooks', 'post-commit')
}

/**
 * Check if content belongs to any version of dotai hook.
 */
function isDotaiHook(content: string): boolean {
  return content.includes('# dotai-hook-v') 
}

/**
 * Install post-commit git hook.
 */
export async function installGitHook(projectRoot: string): Promise<void> {
  const hookPath = getHookPath(projectRoot)
  const existing = await readHookSafe(hookPath)

  if (existing !== null && existing.includes(HOOK_SIGNATURE)) {
    logger.dim('dotai git hook already installed (latest)')
    return
  }

  // Upgrade old version or fresh install
  if (existing !== null && !isDotaiHook(existing)) {
    logger.warn('post-commit hook exists but was not installed by dotai — overwriting is not safe')
    logger.warn('Remove or rename the existing hook first, then re-run install')
    return
  }

  await writeFile(hookPath, HOOK_CONTENT, 'utf-8')
  await chmod(hookPath, 0o755)
}

/**
 * Uninstall post-commit git hook (only if it's a dotai-managed hook).
 */
export async function uninstallGitHook(projectRoot: string): Promise<void> {
  const hookPath = getHookPath(projectRoot)
  const existing = await readHookSafe(hookPath)

  if (existing === null) {
    logger.dim('No post-commit hook found')
    return
  }

  if (!isDotaiHook(existing)) {
    logger.warn('post-commit hook exists but was not installed by dotai — skipping')
    return
  }

  await unlink(hookPath)
}

/**
 * Check if git hook is installed.
 */
export async function isGitHookInstalled(projectRoot: string): Promise<boolean> {
  const hookPath = getHookPath(projectRoot)
  const existing = await readHookSafe(hookPath)
  return existing !== null && isDotaiHook(existing)
}

/**
 * Safely read a hook file, returning null if it doesn't exist.
 */
async function readHookSafe(hookPath: string): Promise<string | null> {
  try {
    await access(hookPath, constants.F_OK)
    return await readFile(hookPath, 'utf-8')
  } catch {
    return null
  }
}
