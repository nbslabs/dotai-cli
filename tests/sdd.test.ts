import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { scaffoldSdd, createFeature, validateFeatureName, listFeatures, detectFeaturePhase, SDD_SKILLS } from '../src/core/sdd-scaffold'
import { pathExists, writeTextFile, ensureDir } from '../src/utils/fs'

describe('sdd', () => {
  let tmpDir: string
  let aiDir: string
  let aiPath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dotai-test-sdd-'))
    aiDir = '.ai'
    aiPath = join(tmpDir, aiDir)
    // Simulate dotai init — create .ai/ with AI.md
    await mkdir(aiPath, { recursive: true })
    await mkdir(join(aiPath, 'commands'), { recursive: true })
    await mkdir(join(aiPath, 'commands-gemini'), { recursive: true })
    await mkdir(join(aiPath, 'prompts'), { recursive: true })
    await mkdir(join(aiPath, 'workflows'), { recursive: true })
    await mkdir(join(aiPath, 'skills'), { recursive: true })
    await writeFile(join(aiPath, 'AI.md'), '# AI Instructions — TestProject\n\n## Project Overview\n')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('scaffoldSdd', () => {
    it('creates all 8 skill files', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      for (const skill of SDD_SKILLS) {
        const skillPath = join(aiPath, 'skills', skill.dirName, 'SKILL.md')
        expect(await pathExists(skillPath)).toBe(true)
      }
    })

    it('creates SDD directory structure', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      expect(await pathExists(join(aiPath, 'sdd', 'README.md'))).toBe(true)
      expect(await pathExists(join(aiPath, 'sdd', '_template-feature', 'idea.md'))).toBe(true)
      expect(await pathExists(join(aiPath, 'sdd', '_template-feature', 'requirements.md'))).toBe(true)
      expect(await pathExists(join(aiPath, 'sdd', '_template-feature', 'tasks', '.gitkeep'))).toBe(true)
      expect(await pathExists(join(aiPath, 'sdd', '_template-feature', 'plans', '.gitkeep'))).toBe(true)
      expect(await pathExists(join(aiPath, 'sdd', '_template-feature', 'evaluation', '.gitkeep'))).toBe(true)
    })

    it('creates cross-tool command files', async () => {
      const result = await scaffoldSdd(tmpDir, aiDir, {})

      // Claude commands
      expect(await pathExists(join(aiPath, 'commands', 'sdd-specify.md'))).toBe(true)
      expect(await pathExists(join(aiPath, 'commands', 'sdd-implement.md'))).toBe(true)

      // Gemini commands
      expect(await pathExists(join(aiPath, 'commands-gemini', 'sdd-specify.toml'))).toBe(true)

      // Copilot prompts
      expect(await pathExists(join(aiPath, 'prompts', 'sdd-specify.prompt.md'))).toBe(true)

      // Antigravity workflows
      expect(await pathExists(join(aiPath, 'workflows', 'sdd-specify.md'))).toBe(true)
    })

    it('appends SDD block to AI.md', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      const content = await readFile(join(aiPath, 'AI.md'), 'utf-8')
      expect(content).toContain('## SDD Toolkit')
      expect(content).toContain('Read `.ai/sdd/README.md`')
    })

    it('does not duplicate SDD block in AI.md on second run', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})
      await scaffoldSdd(tmpDir, aiDir, { force: true })

      const content = await readFile(join(aiPath, 'AI.md'), 'utf-8')
      const matches = content.match(/## SDD Toolkit/g)
      expect(matches?.length).toBe(1)
    })

    it('does not overwrite existing files without --force', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      // Modify a skill file
      const skillPath = join(aiPath, 'skills', 'evaluation-skill', 'SKILL.md')
      await writeFile(skillPath, '# Modified content')

      // Run again without force
      await scaffoldSdd(tmpDir, aiDir, {})

      const content = await readFile(skillPath, 'utf-8')
      expect(content).toBe('# Modified content')
    })

    it('overwrites files with --force', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      // Modify a skill file
      const skillPath = join(aiPath, 'skills', 'evaluation-skill', 'SKILL.md')
      await writeFile(skillPath, '# Modified content')

      // Run again with force
      await scaffoldSdd(tmpDir, aiDir, { force: true })

      const content = await readFile(skillPath, 'utf-8')
      expect(content).toContain('# Skill: Evaluation')
    })

    it('returns created and skipped file counts', async () => {
      const result = await scaffoldSdd(tmpDir, aiDir, {})

      // 8 skills + README + 2 template files + 3 gitkeeps + 28 commands + 1 AI.md append
      expect(result.createdFiles.length).toBeGreaterThan(30)
      expect(result.skippedFiles.length).toBe(0)

      // Second run should skip everything
      const result2 = await scaffoldSdd(tmpDir, aiDir, {})
      expect(result2.createdFiles.length).toBe(0)
      expect(result2.skippedFiles.length).toBeGreaterThan(30)
    })
  })

  describe('createFeature', () => {
    it('creates feature directory from template', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      const sddPath = join(aiPath, 'sdd')
      await createFeature(sddPath, 'my-feature', aiDir)

      expect(await pathExists(join(sddPath, 'my-feature', 'idea.md'))).toBe(true)
      expect(await pathExists(join(sddPath, 'my-feature', 'requirements.md'))).toBe(true)
      expect(await pathExists(join(sddPath, 'my-feature', 'tasks', '.gitkeep'))).toBe(true)
      expect(await pathExists(join(sddPath, 'my-feature', 'plans', '.gitkeep'))).toBe(true)
      expect(await pathExists(join(sddPath, 'my-feature', 'evaluation', '.gitkeep'))).toBe(true)
    })

    it('copies template content into new feature', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})

      const sddPath = join(aiPath, 'sdd')
      await createFeature(sddPath, 'test-feature', aiDir)

      const content = await readFile(join(sddPath, 'test-feature', 'idea.md'), 'utf-8')
      expect(content).toContain('## What I want to build')
    })
  })

  describe('validateFeatureName', () => {
    it('accepts valid kebab-case names', () => {
      expect(validateFeatureName('my-feature')).toBeNull()
      expect(validateFeatureName('auth')).toBeNull()
      expect(validateFeatureName('user-login-flow')).toBeNull()
      expect(validateFeatureName('v2-api')).toBeNull()
    })

    it('rejects empty names', () => {
      expect(validateFeatureName('')).not.toBeNull()
    })

    it('rejects names starting with underscore', () => {
      expect(validateFeatureName('_private')).not.toBeNull()
    })

    it('rejects uppercase names', () => {
      expect(validateFeatureName('MyFeature')).not.toBeNull()
    })

    it('rejects names with spaces', () => {
      expect(validateFeatureName('my feature')).not.toBeNull()
    })

    it('rejects names with underscores', () => {
      expect(validateFeatureName('my_feature')).not.toBeNull()
    })
  })

  describe('listFeatures', () => {
    it('returns empty array when no features exist', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})
      const sddPath = join(aiPath, 'sdd')
      const features = await listFeatures(sddPath)
      expect(features).toEqual([])
    })

    it('lists feature directories excluding _template-feature', async () => {
      await scaffoldSdd(tmpDir, aiDir, {})
      const sddPath = join(aiPath, 'sdd')

      await createFeature(sddPath, 'feature-a', aiDir)
      await createFeature(sddPath, 'feature-b', aiDir)

      const features = await listFeatures(sddPath)
      expect(features).toEqual(['feature-a', 'feature-b'])
      expect(features).not.toContain('_template-feature')
    })
  })

  describe('detectFeaturePhase', () => {
    it('detects Phase 1 when only idea.md exists', async () => {
      const featurePath = join(tmpDir, 'test-feature')
      await mkdir(featurePath, { recursive: true })
      await writeFile(join(featurePath, 'idea.md'), '# My idea')

      const info = await detectFeaturePhase(featurePath)
      expect(info.phase).toBe(1)
      expect(info.phaseName).toBe('Initiate')
    })

    it('detects Phase 3 when tasks exist', async () => {
      const featurePath = join(tmpDir, 'test-feature')
      await mkdir(join(featurePath, 'tasks'), { recursive: true })
      await writeFile(join(featurePath, 'idea.md'), '# My idea')
      await writeFile(join(featurePath, 'requirements.md'), '# Requirements\n\n## Functional Requirements\n1. Do X')
      await writeFile(join(featurePath, 'tasks', '01_setup.task.md'), '# Task 1')

      const info = await detectFeaturePhase(featurePath)
      expect(info.phase).toBe(3)
      expect(info.taskCount).toBe(1)
    })

    it('detects Phase 7 when code-review.md exists', async () => {
      const featurePath = join(tmpDir, 'test-feature')
      await mkdir(join(featurePath, 'tasks'), { recursive: true })
      await mkdir(join(featurePath, 'plans'), { recursive: true })
      await mkdir(join(featurePath, 'evaluation'), { recursive: true })
      await writeFile(join(featurePath, 'idea.md'), '# My idea')
      await writeFile(join(featurePath, 'requirements.md'), '# Requirements\n\n## Functional Requirements\n1. Do X')
      await writeFile(join(featurePath, 'tasks', '01_setup.task.md'), '# Task 1')
      await writeFile(join(featurePath, 'plans', '01_setup.plan.md'), '# Plan 1')
      await writeFile(join(featurePath, 'evaluation', '01_setup.evaluation.md'), '# Eval 1')
      await writeFile(join(featurePath, 'evaluation', '01_setup.result.md'), '# Result: PASS')
      await writeFile(join(featurePath, 'code-review.md'), '# Review')

      const info = await detectFeaturePhase(featurePath)
      expect(info.phase).toBe(7)
      expect(info.hasCodeReview).toBe(true)
    })

    it('detects Phase 5 (in-progress) when only some tasks have results', async () => {
      const featurePath = join(tmpDir, 'test-feature')
      await mkdir(join(featurePath, 'tasks'), { recursive: true })
      await mkdir(join(featurePath, 'plans'), { recursive: true })
      await mkdir(join(featurePath, 'evaluation'), { recursive: true })
      await writeFile(join(featurePath, 'idea.md'), '# My idea')
      await writeFile(join(featurePath, 'requirements.md'), '# Requirements\n\n## Functional Requirements\n1. Do X')

      // 3 tasks, 3 plans, 3 evaluation criteria
      for (let i = 1; i <= 3; i++) {
        await writeFile(join(featurePath, 'tasks', `0${i}_task.task.md`), `# Task ${i}`)
        await writeFile(join(featurePath, 'plans', `0${i}_task.plan.md`), `# Plan ${i}`)
        await writeFile(join(featurePath, 'evaluation', `0${i}_task.evaluation.md`), `# Eval ${i}`)
      }

      // Only 1 out of 3 has a result
      await writeFile(join(featurePath, 'evaluation', '01_task.result.md'), '# Evaluation Result\n\n## Overall Verdict: PASS')

      const info = await detectFeaturePhase(featurePath)
      expect(info.phase).toBe(5) // Phase 5 (in-progress), NOT 6
      expect(info.phaseName).toBe('Implement')
      expect(info.taskCount).toBe(3)
      expect(info.resultCount).toBe(1)
      expect(info.passCount).toBe(1)
      expect(info.allPassed).toBe(false)
    })

    it('detects Phase 6 only when ALL tasks have passing results', async () => {
      const featurePath = join(tmpDir, 'test-feature')
      await mkdir(join(featurePath, 'tasks'), { recursive: true })
      await mkdir(join(featurePath, 'plans'), { recursive: true })
      await mkdir(join(featurePath, 'evaluation'), { recursive: true })
      await writeFile(join(featurePath, 'idea.md'), '# My idea')
      await writeFile(join(featurePath, 'requirements.md'), '# Requirements\n\n## Functional Requirements\n1. Do X')

      // 2 tasks, all with plans, evaluations, and PASS results
      for (let i = 1; i <= 2; i++) {
        await writeFile(join(featurePath, 'tasks', `0${i}_task.task.md`), `# Task ${i}`)
        await writeFile(join(featurePath, 'plans', `0${i}_task.plan.md`), `# Plan ${i}`)
        await writeFile(join(featurePath, 'evaluation', `0${i}_task.evaluation.md`), `# Eval ${i}`)
        await writeFile(join(featurePath, 'evaluation', `0${i}_task.result.md`), `# Result\n\n## Overall Verdict: PASS`)
      }

      const info = await detectFeaturePhase(featurePath)
      expect(info.phase).toBe(6)
      expect(info.phaseName).toBe('Evaluate')
      expect(info.allPassed).toBe(true)
      expect(info.passCount).toBe(2)
      expect(info.resultCount).toBe(2)
    })
  })
})
