import { access, mkdir, readFile, writeFile, lstat, readlink, constants } from 'fs/promises'
import { dirname } from 'path'

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await lstat(filePath)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await lstat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    // Also check via lstat for broken symlinks
    try {
      await lstat(p)
      return true
    } catch {
      return false
    }
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content) as T
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath))
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8')
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath))
  await writeFile(filePath, content, 'utf-8')
}

export async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    const stat = await lstat(filePath)
    return stat.isSymbolicLink()
  } catch {
    return false
  }
}

export async function getSymlinkTarget(filePath: string): Promise<string | null> {
  try {
    return await readlink(filePath)
  } catch {
    return null
  }
}

export async function hasWriteAccess(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.W_OK)
    return true
  } catch {
    return false
  }
}
