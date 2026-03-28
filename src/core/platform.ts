import { platform } from 'os'

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

export function isLinux(): boolean {
  return process.platform === 'linux'
}

export function getPlatformName(): string {
  const p = platform()
  switch (p) {
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return p
  }
}

/**
 * Get the symlink type to use for directories on the current platform.
 * Windows uses 'junction' (no elevated privileges needed on Win10+).
 * Unix/macOS uses 'dir'.
 */
export function getDirSymlinkType(): 'junction' | 'dir' {
  return isWindows() ? 'junction' : 'dir'
}

/**
 * Get the symlink type for files.
 * On Windows, explicitly use 'file'. On Unix, undefined (default).
 */
export function getFileSymlinkType(): 'file' | null {
  return isWindows() ? 'file' : null
}

/**
 * Get the user's home directory.
 */
export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '~'
}
