import { symlink, unlink, lstat, readlink, rename, rm } from 'fs/promises'
import { join, relative, dirname, resolve } from 'path'
import { isWindows } from './platform'
import { ensureDir, pathExists, isSymbolicLink as checkIsSymlink } from '../utils/fs'

export interface SymlinkOptions {
  force?: boolean
  backup?: boolean
  dryRun?: boolean
}

export interface RemoveOptions {
  restore?: boolean
  dryRun?: boolean
}

export interface SymlinkResult {
  source: string
  target: string
  status: 'created' | 'already-linked' | 'skipped' | 'backed-up-and-created' | 'error' | 'dry-run'
  message?: string
}

export type SymlinkVerifyStatus = 'valid' | 'broken' | 'wrong-target' | 'not-symlink' | 'missing'

export interface SymlinkStatus {
  target: string
  expectedSource: string
  status: SymlinkVerifyStatus
  actualTarget?: string
  message?: string
}

/**
 * Create a symlink from target -> source, using relative paths for portability.
 * On Windows, uses junction for directories.
 */
export async function createSymlink(
  source: string,
  target: string,
  opts: SymlinkOptions = {}
): Promise<SymlinkResult> {
  const { force = false, backup = true, dryRun = false } = opts

  if (dryRun) {
    return { source, target, status: 'dry-run', message: `Would link ${target} → ${source}` }
  }

  try {
    // Check if target already exists
    const targetLinkExists = await checkIsSymlink(target)
    const targetExists = await pathExists(target)

    if (targetLinkExists) {
      // Target is already a symlink
      const currentTarget = await readlink(target)
      const expectedRelative = computeRelativePath(source, target)

      if (currentTarget === expectedRelative || resolve(dirname(target), currentTarget) === resolve(source)) {
        return { source, target, status: 'already-linked', message: 'Already correctly linked' }
      }

      // Symlink points elsewhere
      if (!force) {
        return {
          source,
          target,
          status: 'skipped',
          message: `Symlink exists but points to ${currentTarget} instead of ${expectedRelative}`,
        }
      }

      // Force: remove and recreate
      await unlink(target)
    } else if (targetExists) {
      // Target is a real file/directory
      if (!force) {
        return {
          source,
          target,
          status: 'skipped',
          message: `Real file/directory exists at ${target}. Use --force to overwrite.`,
        }
      }

      // Back up and replace
      if (backup) {
        const backupPath = `${target}.dotai.bak`
        await rename(target, backupPath)
        await createSymlinkFs(source, target)
        return {
          source,
          target,
          status: 'backed-up-and-created',
          message: `Backed up to ${backupPath} and linked`,
        }
      } else {
        // Remove without backup
        const stat = await lstat(target)
        if (stat.isDirectory()) {
          await rm(target, { recursive: true, force: true })
        } else {
          await unlink(target)
        }
      }
    }

    // Create symlink
    await ensureDir(dirname(target))
    await createSymlinkFs(source, target)

    return { source, target, status: 'created', message: 'Linked successfully' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { source, target, status: 'error', message }
  }
}

/**
 * Remove a symlink, optionally restoring backup.
 */
export async function removeSymlink(
  target: string,
  opts: RemoveOptions = {}
): Promise<SymlinkResult> {
  const { restore = true, dryRun = false } = opts

  if (dryRun) {
    return { source: '', target, status: 'dry-run', message: `Would unlink ${target}` }
  }

  try {
    const isLink = await checkIsSymlink(target)
    if (!isLink) {
      return {
        source: '',
        target,
        status: 'skipped',
        message: 'Not a symlink, skipping',
      }
    }

    const linkTarget = await readlink(target)
    await unlink(target)

    // Restore backup if it exists
    const backupPath = `${target}.dotai.bak`
    if (restore && (await pathExists(backupPath))) {
      await rename(backupPath, target)
      return {
        source: linkTarget,
        target,
        status: 'created',
        message: 'Unlinked and restored backup',
      }
    }

    return {
      source: linkTarget,
      target,
      status: 'created',
      message: 'Unlinked successfully',
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { source: '', target, status: 'error', message }
  }
}

/**
 * Verify a symlink points to the expected source.
 */
export async function verifySymlink(
  target: string,
  expectedSource: string
): Promise<SymlinkStatus> {
  const exists = await pathExists(target)
  const isLink = await checkIsSymlink(target)

  if (!isLink && !exists) {
    return { target, expectedSource, status: 'missing', message: 'Path does not exist' }
  }

  if (!isLink) {
    return { target, expectedSource, status: 'not-symlink', message: 'Path exists but is not a symlink' }
  }

  const actualTarget = await readlink(target)
  const expectedRelative = computeRelativePath(expectedSource, target)

  // Check if it resolves to the same path
  const resolvedActual = resolve(dirname(target), actualTarget)
  const resolvedExpected = resolve(expectedSource)

  if (resolvedActual === resolvedExpected || actualTarget === expectedRelative) {
    // Check if the source actually exists (broken symlink detection)
    const sourceExists = await pathExists(resolvedActual)
    if (!sourceExists) {
      return {
        target,
        expectedSource,
        status: 'broken',
        actualTarget,
        message: 'Symlink target does not exist',
      }
    }
    return { target, expectedSource, status: 'valid', actualTarget }
  }

  return {
    target,
    expectedSource,
    status: 'wrong-target',
    actualTarget,
    message: `Points to ${actualTarget} instead of ${expectedRelative}`,
  }
}

export async function isSymlink(path: string): Promise<boolean> {
  return checkIsSymlink(path)
}

export async function getSymlinkTarget(path: string): Promise<string | null> {
  try {
    return await readlink(path)
  } catch {
    return null
  }
}

/**
 * Compute the relative path from target to source for portable symlinks.
 */
function computeRelativePath(source: string, target: string): string {
  const targetDir = dirname(target)
  return relative(targetDir, source)
}

/**
 * Low-level symlink creation with platform awareness.
 */
async function createSymlinkFs(source: string, target: string): Promise<void> {
  const relPath = computeRelativePath(source, target)

  // Determine if source is a directory
  let isDir = false
  try {
    const stat = await lstat(source)
    isDir = stat.isDirectory()
  } catch {
    // Source might not exist yet, infer from filename (last segment)
    const basename = source.split('/').pop() || source
    isDir = !basename.includes('.')
  }

  if (isWindows() && isDir) {
    await symlink(resolve(source), target, 'junction')
  } else {
    await symlink(relPath, target)
  }
}
