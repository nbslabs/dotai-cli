import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readlink, lstat, mkdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSymlink, removeSymlink, verifySymlink, isSymlink, getSymlinkTarget } from '../src/core/symlink'

describe('symlink', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-symlink-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('createSymlink', () => {
    it('creates a file symlink', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')

      const result = await createSymlink(source, target)
      expect(result.status).toBe('created')

      const stat = await lstat(target)
      expect(stat.isSymbolicLink()).toBe(true)

      const content = await readFile(target, 'utf-8')
      expect(content).toBe('hello')
    })

    it('creates a directory symlink', async () => {
      const sourceDir = join(tmpDir, 'source-dir')
      const targetDir = join(tmpDir, 'target-dir')
      await mkdir(sourceDir)
      await writeFile(join(sourceDir, 'test.txt'), 'hello')

      const result = await createSymlink(sourceDir, targetDir)
      expect(result.status).toBe('created')

      const stat = await lstat(targetDir)
      expect(stat.isSymbolicLink()).toBe(true)
    })

    it('detects already-linked symlinks', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')

      await createSymlink(source, target)
      const result = await createSymlink(source, target)
      expect(result.status).toBe('already-linked')
    })

    it('skips when real file exists and no force', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'source content')
      await writeFile(target, 'existing content')

      const result = await createSymlink(source, target, { force: false })
      expect(result.status).toBe('skipped')

      // Original file should be untouched
      const content = await readFile(target, 'utf-8')
      expect(content).toBe('existing content')
    })

    it('backs up and replaces with force', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'source content')
      await writeFile(target, 'existing content')

      const result = await createSymlink(source, target, { force: true, backup: true })
      expect(result.status).toBe('backed-up-and-created')

      // Backup should exist
      const backup = await readFile(`${target}.dotai.bak`, 'utf-8')
      expect(backup).toBe('existing content')

      // Symlink should point to source
      const content = await readFile(target, 'utf-8')
      expect(content).toBe('source content')
    })

    it('creates parent directories', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'deep', 'nested', 'target.txt')
      await writeFile(source, 'hello')

      const result = await createSymlink(source, target)
      expect(result.status).toBe('created')
    })

    it('supports dry run', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')

      const result = await createSymlink(source, target, { dryRun: true })
      expect(result.status).toBe('dry-run')

      // Target should not exist
      const exists = await lstat(target).catch(() => null)
      expect(exists).toBeNull()
    })

    it('uses relative paths for portability', async () => {
      const source = join(tmpDir, 'ai', 'file.txt')
      const target = join(tmpDir, 'link.txt')
      await mkdir(join(tmpDir, 'ai'))
      await writeFile(source, 'hello')

      await createSymlink(source, target)
      const linkTarget = await readlink(target)
      expect(linkTarget).toBe(join('ai', 'file.txt'))
    })
  })

  describe('removeSymlink', () => {
    it('removes a symlink', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')
      await createSymlink(source, target)

      const result = await removeSymlink(target)
      expect(result.status).toBe('created') // 'created' means operation was successful

      const exists = await lstat(target).catch(() => null)
      expect(exists).toBeNull()
    })

    it('skips non-symlink paths', async () => {
      const target = join(tmpDir, 'real-file.txt')
      await writeFile(target, 'hello')

      const result = await removeSymlink(target)
      expect(result.status).toBe('skipped')

      // File should still exist
      const content = await readFile(target, 'utf-8')
      expect(content).toBe('hello')
    })

    it('restores backup if exists', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'source content')
      await writeFile(target, 'original content')

      // Create backup and symlink
      await createSymlink(source, target, { force: true, backup: true })

      // Remove with restore
      await removeSymlink(target, { restore: true })

      const content = await readFile(target, 'utf-8')
      expect(content).toBe('original content')
    })
  })

  describe('verifySymlink', () => {
    it('returns valid for correct symlink', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')
      await createSymlink(source, target)

      const status = await verifySymlink(target, source)
      expect(status.status).toBe('valid')
    })

    it('returns missing for non-existent path', async () => {
      const target = join(tmpDir, 'nonexistent')
      const source = join(tmpDir, 'source')

      const status = await verifySymlink(target, source)
      expect(status.status).toBe('missing')
    })

    it('returns not-symlink for real files', async () => {
      const target = join(tmpDir, 'real-file.txt')
      const source = join(tmpDir, 'source.txt')
      await writeFile(target, 'hello')

      const status = await verifySymlink(target, source)
      expect(status.status).toBe('not-symlink')
    })
  })

  describe('isSymlink', () => {
    it('returns true for symlinks', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')
      await createSymlink(source, target)

      expect(await isSymlink(target)).toBe(true)
    })

    it('returns false for regular files', async () => {
      const file = join(tmpDir, 'file.txt')
      await writeFile(file, 'hello')

      expect(await isSymlink(file)).toBe(false)
    })

    it('returns false for non-existent paths', async () => {
      expect(await isSymlink(join(tmpDir, 'nope'))).toBe(false)
    })
  })

  describe('getSymlinkTarget', () => {
    it('returns link target for symlinks', async () => {
      const source = join(tmpDir, 'source.txt')
      const target = join(tmpDir, 'target.txt')
      await writeFile(source, 'hello')
      await createSymlink(source, target)

      const linkTarget = await getSymlinkTarget(target)
      expect(linkTarget).toBe('source.txt')
    })

    it('returns null for non-symlinks', async () => {
      const file = join(tmpDir, 'file.txt')
      await writeFile(file, 'hello')

      expect(await getSymlinkTarget(file)).toBeNull()
    })
  })
})
