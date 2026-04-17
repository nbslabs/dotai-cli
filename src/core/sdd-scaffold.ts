import { join } from 'path'
import { readdir } from 'fs/promises'
import { ensureDir, writeTextFile, pathExists, readTextFile } from '../utils/fs'
import { logger } from '../utils/logger'

// ─── Skill Templates ────────────────────────────────────────────────

const FEATURE_DISCOVERY_CLAUSE = `
## Feature Resolution
If the feature name is not provided in the prompt, list all directories in \`.ai/sdd/\`
(excluding \`_template-feature/\` and \`README.md\`) and ask the developer which feature
to operate on. Do not guess.
`

function skillRequirementGeneration(): string {
  return `# Skill: Requirement Generation

## Purpose
Read the developer's raw idea from \`idea.md\` and produce a complete, structured \`requirements.md\` for the feature.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read \`.ai/sdd/<feature-name>/idea.md\` in full before writing anything.
2. Do not invent scope. Only formalize and expand what the developer has already implied.
3. Produce \`requirements.md\` with the following sections:
   - **Overview** — one paragraph restating the goal in clear language.
   - **Functional Requirements** — numbered list of specific, testable capabilities the system must have.
   - **User Flows** — step-by-step descriptions of how a user moves through the feature.
   - **Edge Cases** — explicit list of boundary conditions and error states that must be handled.
   - **Non-Functional Requirements** — performance, security, accessibility, or compatibility constraints.
   - **Out of Scope** — explicit list of things this feature does NOT cover.
4. Every functional requirement must be testable. Avoid vague language like "the system should be fast" — write "the API must respond within 300ms under normal load" instead.
5. Save the output to \`.ai/sdd/<feature-name>/requirements.md\`.
6. After saving, notify the developer that human review is required before the pipeline continues.
`
}

function skillTaskDecompose(): string {
  return `# Skill: Task Decomposition

## Purpose
Break an approved \`requirements.md\` into a set of discrete, implementable task files in the \`tasks/\` directory.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read \`.ai/sdd/<feature-name>/requirements.md\` in full.
2. Identify every distinct unit of work required to fulfill the requirements.
3. For each task:
   - Assign a zero-padded index reflecting its execution order (01, 02, 03, ...).
   - Derive a short snake_case slug from the task title.
   - Write a task file named \`<index>_<slug>.task.md\` into \`.ai/sdd/<feature-name>/tasks/\`.
4. Each task file must contain:
   - **Task title**
   - **Goal** — one sentence describing what this task achieves.
   - **Depends on** — list of task indices this task must follow (empty if none).
   - **Input files** — existing files the coding agent must read to do this task.
   - **Output files** — files the coding agent must create or modify.
   - **Definition of done** — specific, observable criteria that confirm the task is complete.
5. Tasks must be ordered so all dependencies are satisfied before a task is attempted. No circular dependencies.
6. Tasks must be granular enough for a coding agent to execute autonomously without making architectural decisions.
7. After writing all task files, notify the developer that human review is required.
`
}

function skillPlanGeneration(): string {
  return `# Skill: Plan Generation

## Purpose
For each task file in \`tasks/\`, produce a corresponding implementation plan file in \`plans/\`.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read \`.ai/sdd/<feature-name>/requirements.md\` for full context.
2. For each file in \`.ai/sdd/<feature-name>/tasks/\`:
   a. Read the task file completely.
   b. Produce a plan file named with the same index and slug: \`<index>_<slug>.plan.md\`.
   c. Save it to \`.ai/sdd/<feature-name>/plans/\`.
3. Each plan file must contain:
   - **Task reference** — the task index and title this plan belongs to.
   - **Implementation steps** — ordered, numbered steps the coding agent must follow.
   - **Files to create** — exact file paths and a description of their purpose.
   - **Files to modify** — exact file paths, which sections to change, and what to change them to.
   - **Patterns and conventions** — specific coding patterns, naming conventions, or architectural rules to follow.
   - **APIs and interfaces** — any internal or external APIs the task must call or implement.
   - **Error handling** — how the implementation must handle failures and edge cases.
4. Plans must be detailed enough that a coding agent can follow them without making design decisions.
`
}

function skillEvaluationGeneration(): string {
  return `# Skill: Evaluation Generation

## Purpose
For each task file in \`tasks/\`, produce a corresponding acceptance criteria file in \`evaluation/\`.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read \`.ai/sdd/<feature-name>/requirements.md\` for full context.
2. For each file in \`.ai/sdd/<feature-name>/tasks/\`:
   a. Read the task file and its corresponding plan file in \`plans/\`.
   b. Produce an evaluation file named with the same index and slug: \`<index>_<slug>.evaluation.md\`.
   c. Save it to \`.ai/sdd/<feature-name>/evaluation/\`.
3. Each evaluation file must contain:
   - **Task reference** — the task index and title this evaluation belongs to.
   - **Acceptance criteria** — numbered list of specific, verifiable conditions that must all be true for the task to pass.
   - **Test scenarios** — concrete input/output examples that demonstrate each criterion.
   - **Edge case checks** — specific edge conditions the evaluator must verify.
   - **Files to inspect** — exact file paths the evaluator must examine.
   - **Failure examples** — examples of what a failing implementation looks like, to help the evaluator make accurate judgements.
4. Every criterion must be verifiable by reading code or running the application. Avoid subjective criteria.
5. After writing all evaluation files, notify the developer that human review is required before implementation begins.
`
}

function skillPlanImplementation(): string {
  return `# Skill: Plan Implementation

## Purpose
Execute the implementation plan for a single task by following its plan file exactly.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Identify the current task to implement. Always work on the lowest-indexed incomplete task.
2. Read the following files before writing any code:
   - \`.ai/sdd/<feature-name>/tasks/<index>_<slug>.task.md\`
   - \`.ai/sdd/<feature-name>/plans/<index>_<slug>.plan.md\`
   - \`.ai/knowledge/\` — for codebase context and established conventions.
3. Follow the implementation steps in the plan file in order. Do not skip steps.
4. Do not make design decisions not covered by the plan. If something is unclear, check \`requirements.md\` and \`plans/\` first. If still unclear, stop and ask the developer.
5. After completing the task, verify that all output files listed in the task file have been created or modified as specified.
6. If this is a retry after a failed evaluation:
   - Read the evaluation result file (\`.result.md\`) for this task first.
   - Focus only on the failing criteria — do not rewrite passing code.
   - After fixing, report completion and await re-evaluation.
7. Do not begin the next task automatically. Report completion and wait.
`
}

function skillEvaluation(): string {
  return `# Skill: Evaluation

## Purpose
Verify a completed task implementation against its acceptance criteria and produce a clear pass or fail verdict.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Identify the task to evaluate by its index.
2. Read the following files:
   - \`.ai/sdd/<feature-name>/evaluation/<index>_<slug>.evaluation.md\`
   - \`.ai/sdd/<feature-name>/tasks/<index>_<slug>.task.md\`
   - All files listed under "Files to inspect" in the evaluation file.
3. Check every acceptance criterion in the evaluation file. For each criterion, record:
   - Whether it passes or fails.
   - The specific evidence from the code that supports this verdict.
4. Save the evaluation report to \`.ai/sdd/<feature-name>/evaluation/<index>_<slug>.result.md\` with:
   - **Overall verdict** — PASS or FAIL.
   - **Criterion results** — the pass/fail verdict and evidence for each criterion.
   - **Failure details** — for any failing criterion, a precise description of what is wrong and what the correct implementation should look like.
5. If the overall verdict is FAIL, the Coding Agent must retry the task using the failure details as input. Do not advance to the next task until the verdict is PASS.
6. If the overall verdict is PASS, report completion and proceed to the next task's evaluation.
`
}

function skillCodeReview(): string {
  return `# Skill: Code Review

## Purpose
Review the entire implementation of a completed feature holistically and produce a structured review report.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read the following context files first:
   - \`.ai/sdd/<feature-name>/requirements.md\`
   - \`.ai/sdd/<feature-name>/tasks/\` — all task files.
   - \`.ai/knowledge/\` — for established project conventions.
2. Read the full implementation — every file created or modified during this feature cycle.
3. Review the code as a complete system, not task by task. Look specifically for:
   - **Consistency** — naming conventions, code style, and architectural patterns inconsistent with the rest of the codebase.
   - **Redundancy** — logic or utilities duplicated across files that should be shared.
   - **Security** — input validation gaps, insecure defaults, exposed secrets, or unsafe data handling.
   - **Error handling** — missing or insufficient handling of failure states.
   - **Test coverage** — missing tests for critical paths or edge cases.
   - **Correctness** — any behaviour that does not match the requirements even if it passed per-task evaluation.
4. Save the review report to \`.ai/sdd/<feature-name>/code-review.md\` with:
   - **Summary** — overall assessment in 2-3 sentences.
   - **Issues** — each issue listed with severity (critical / major / minor), the affected file and line range, a description of the problem, and a suggested fix.
   - **Positives** — notable things done well.
5. Do not auto-fix anything. The review report is for the developer to read and act on.
`
}

function skillKnowledgeUpdate(): string {
  return `# Skill: Knowledge Update

## Purpose
Update the \`.ai/knowledge/\` directory to reflect everything built and decided during this feature cycle, so future sessions start with accurate codebase context.
${FEATURE_DISCOVERY_CLAUSE}
## Instructions
1. Read the completed feature artifacts:
   - \`.ai/sdd/<feature-name>/requirements.md\`
   - \`.ai/sdd/<feature-name>/tasks/\` — all task files.
   - \`.ai/sdd/<feature-name>/plans/\` — all plan files.
2. Read the existing \`.ai/knowledge/\` directory to understand what is already documented.
3. Update or create knowledge files to reflect:
   - **New modules or components** — what they do, where they live, and how they are structured.
   - **New patterns or conventions** — coding patterns established during this feature that should be followed in future work.
   - **New APIs or interfaces** — internal APIs created, with their signatures and usage examples.
   - **Architectural decisions** — significant decisions made and the reasoning behind them.
   - **Known limitations** — anything intentionally deferred or left incomplete, and why.
4. Do not delete existing knowledge entries unless they are factually incorrect. Prefer adding or updating.
5. Keep knowledge files concise — they are reference material for agents, not documentation for humans.
`
}

// ─── Skill Registry ─────────────────────────────────────────────────

export interface SddSkillDefinition {
  dirName: string
  getContent: () => string
}

export const SDD_SKILLS: SddSkillDefinition[] = [
  { dirName: 'requirement-generation-skill', getContent: skillRequirementGeneration },
  { dirName: 'task-decompose-skill', getContent: skillTaskDecompose },
  { dirName: 'plan-generation-skill', getContent: skillPlanGeneration },
  { dirName: 'evaluation-generation-skill', getContent: skillEvaluationGeneration },
  { dirName: 'plan-implementation-skill', getContent: skillPlanImplementation },
  { dirName: 'evaluation-skill', getContent: skillEvaluation },
  { dirName: 'code-review-skill', getContent: skillCodeReview },
  { dirName: 'knowledge-update-skill', getContent: skillKnowledgeUpdate },
]

// ─── SDD README Template ────────────────────────────────────────────

function sddReadme(): string {
  return `# SDD Toolkit

Spec-Driven Development (SDD) is a structured workflow where specifications drive implementation rather than emerging from it. Every piece of code produced by an AI agent in this project traces back to a human-reviewed specification.

This toolkit integrates with \`dotai\` and lives at \`.ai/sdd/\`. It provides skills, templates, and a defined workflow that takes a raw feature idea through 8 phases to a reviewed, context-synced implementation.

---

## Workflow Overview

| Phase | Name | Who | Skill | Output |
|-------|------|-----|-------|--------|
| 1 | Initiate | Human | — | \`idea.md\` |
| 2 | Specify | Agent | \`requirement-generation-skill\` | \`requirements.md\` |
| 3 | Decompose | Agent | \`task-decompose-skill\` | \`tasks/*.task.md\` |
| 4 | Plan | Agent | \`plan-generation-skill\` + \`evaluation-generation-skill\` | \`plans/*.plan.md\` + \`evaluation/*.evaluation.md\` |
| 5 | Implement | Agent | \`plan-implementation-skill\` | Source code |
| 6 | Evaluate | Agent | \`evaluation-skill\` | \`evaluation/*.result.md\` (pass/fail per task) |
| 7 | Review | Agent + Human | \`code-review-skill\` | \`code-review.md\` |
| 8 | Context-sync | Agent | \`knowledge-update-skill\` | Updated \`.ai/knowledge/\` |

Human review is required after Phase 2, Phase 3, Phase 4, and Phase 7.

---

## Starting a New Feature

### Step 1 — Create the feature directory

\`\`\`bash
dotai sdd new my-feature-name
\`\`\`

### Step 2 — Write your idea

Open \`.ai/sdd/my-feature-name/idea.md\` and fill it in by hand. This is the only file you write yourself. Be as clear and specific as you can about what you want to build and why.

### Step 3 — Run the pipeline

Open your AI coding agent and run the phases in order using the commands below.

---

## How to Use Each Phase

### Phase 2 — Specify

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-specify my-feature-name\` |
| Gemini CLI | \`/sdd-specify my-feature-name\` |
| Copilot | Use prompt \`sdd-specify\` |
| Antigravity | Use workflow \`sdd-specify\` |

**Review** \`requirements.md\` before continuing. Correct anything that does not match your intent.

### Phase 3 — Decompose

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-decompose my-feature-name\` |
| Gemini CLI | \`/sdd-decompose my-feature-name\` |
| Copilot | Use prompt \`sdd-decompose\` |
| Antigravity | Use workflow \`sdd-decompose\` |

**Review** all files in \`tasks/\` before continuing. Check that the order is correct and every requirement is covered.

### Phase 4 — Plan

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-plan my-feature-name\` |
| Gemini CLI | \`/sdd-plan my-feature-name\` |
| Copilot | Use prompt \`sdd-plan\` |
| Antigravity | Use workflow \`sdd-plan\` |

**Review** both \`plans/\` and \`evaluation/\` before continuing. The evaluation files are the contract for Phase 6.

### Phase 5 — Implement

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-implement my-feature-name\` |
| Gemini CLI | \`/sdd-implement my-feature-name\` |
| Copilot | Use prompt \`sdd-implement\` |
| Antigravity | Use workflow \`sdd-implement\` |

Repeat for each task. Do not run Phase 6 until a task is complete.

### Phase 6 — Evaluate

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-evaluate my-feature-name\` |
| Gemini CLI | \`/sdd-evaluate my-feature-name\` |
| Copilot | Use prompt \`sdd-evaluate\` |
| Antigravity | Use workflow \`sdd-evaluate\` |

If the verdict is FAIL, the agent will retry Phase 5 for that task. If the verdict is PASS, move to the next task.

### Phase 7 — Review

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-review my-feature-name\` |
| Gemini CLI | \`/sdd-review my-feature-name\` |
| Copilot | Use prompt \`sdd-review\` |
| Antigravity | Use workflow \`sdd-review\` |

**Read the review report** (\`code-review.md\`) and decide what to fix before merging.

### Phase 8 — Context-sync

| Tool | Command |
|------|---------|
| Claude Code | \`/sdd-sync my-feature-name\` |
| Gemini CLI | \`/sdd-sync my-feature-name\` |
| Copilot | Use prompt \`sdd-sync\` |
| Antigravity | Use workflow \`sdd-sync\` |

Run this at the end of every feature cycle without exception.

---

## Rules for AI Agents

- Always read the relevant skill file before starting any phase.
- Never skip a phase or change the order.
- Never proceed past a human review checkpoint without explicit developer confirmation.
- Always read \`.ai/knowledge/\` before starting Phase 5 to understand existing codebase conventions.
- If a task or plan is ambiguous, stop and ask the developer. Do not make assumptions.
- The evaluation files in \`evaluation/\` are the source of truth for correctness. They override your own judgement.

---

## Feature Directory Structure

\`\`\`
.ai/sdd/my-feature/
+-- idea.md                          <- Phase 1: human writes this
+-- requirements.md                  <- Phase 2: generated by agent
+-- tasks/
|   +-- 01_user_auth.task.md         <- Phase 3: generated by agent
|   +-- 02_api_routes.task.md
+-- plans/
|   +-- 01_user_auth.plan.md         <- Phase 4: generated by agent
|   +-- 02_api_routes.plan.md
+-- evaluation/
|   +-- 01_user_auth.evaluation.md   <- Phase 4: acceptance criteria
|   +-- 01_user_auth.result.md       <- Phase 6: pass/fail verdict
|   +-- 02_api_routes.evaluation.md
|   +-- 02_api_routes.result.md
+-- code-review.md                   <- Phase 7: holistic review report
\`\`\`

## File Naming Convention

Task, plan, and evaluation files share the same naming pattern:

\`\`\`
<zero-padded-index>_<snake_case_title>.<type>.md
\`\`\`

Examples:
- \`01_user_authentication.task.md\`
- \`01_user_authentication.plan.md\`
- \`01_user_authentication.evaluation.md\`
- \`01_user_authentication.result.md\`

The files for a given task always have the same index and slug.
`
}

// ─── Template Feature Files ─────────────────────────────────────────

function templateIdeaMd(): string {
  return `# Feature Idea

## What I want to build
<!-- Describe the feature in your own words. What is it? What problem does it solve? -->

## Why it matters
<!-- Why is this important? Who benefits and how? -->

## What success looks like
<!-- What does a working implementation feel like to use? What can a user do that they couldn't do before? -->

## Known constraints or requirements
<!-- Any technical constraints, existing patterns to follow, or hard requirements you already know about. -->

## What is out of scope
<!-- Anything you explicitly do NOT want this feature to include. -->
`
}

function templateRequirementsMd(): string {
  return `# Requirements

> This file is generated by the Requirements Agent in Phase 2.
> Do not edit manually before the agent has run.
> After generation, review carefully and correct anything that does not match your intent.
`
}

// ─── Cross-tool Command Templates ───────────────────────────────────

interface SddPhaseCommand {
  name: string         // e.g. "sdd-specify"
  phase: number
  phaseName: string
  skillDir: string
  description: string
}

const SDD_PHASE_COMMANDS: SddPhaseCommand[] = [
  {
    name: 'sdd-specify',
    phase: 2,
    phaseName: 'Specify',
    skillDir: 'requirement-generation-skill',
    description: 'Generate requirements from idea.md',
  },
  {
    name: 'sdd-decompose',
    phase: 3,
    phaseName: 'Decompose',
    skillDir: 'task-decompose-skill',
    description: 'Break requirements into implementable tasks',
  },
  {
    name: 'sdd-plan',
    phase: 4,
    phaseName: 'Plan',
    skillDir: 'plan-generation-skill',
    description: 'Generate implementation plans and evaluation criteria for all tasks',
  },
  {
    name: 'sdd-implement',
    phase: 5,
    phaseName: 'Implement',
    skillDir: 'plan-implementation-skill',
    description: 'Implement the next incomplete task following its plan',
  },
  {
    name: 'sdd-evaluate',
    phase: 6,
    phaseName: 'Evaluate',
    skillDir: 'evaluation-skill',
    description: 'Evaluate completed task against acceptance criteria',
  },
  {
    name: 'sdd-review',
    phase: 7,
    phaseName: 'Review',
    skillDir: 'code-review-skill',
    description: 'Review the full feature implementation holistically',
  },
  {
    name: 'sdd-sync',
    phase: 8,
    phaseName: 'Context-sync',
    skillDir: 'knowledge-update-skill',
    description: 'Update knowledge base with feature decisions and patterns',
  },
]

function claudeCommand(cmd: SddPhaseCommand): string {
  const extra = cmd.phase === 4
    ? `\nAfter generating plans, also run the evaluation generation skill:\nRead and follow the skill at \`.ai/skills/evaluation-generation-skill/SKILL.md\`\nApply it to the same feature.\n`
    : ''
  return `# /${cmd.name}

Run Phase ${cmd.phase} (${cmd.phaseName}) of the SDD workflow.

1. Read and follow the skill at \`.ai/skills/${cmd.skillDir}/SKILL.md\`
2. Apply it to the feature at \`.ai/sdd/$ARGUMENTS/\`
3. If no feature name is provided, list features in \`.ai/sdd/\` and ask which one to use.
${extra}`
}

function geminiCommand(cmd: SddPhaseCommand): string {
  const extra = cmd.phase === 4
    ? `After generating plans, also run the evaluation generation skill at .ai/skills/evaluation-generation-skill/SKILL.md for the same feature.\n`
    : ''
  return `description = "Phase ${cmd.phase}: ${cmd.description}"
prompt = """
Read and follow the skill at .ai/skills/${cmd.skillDir}/SKILL.md
Apply it to the feature at .ai/sdd/{{args}}/
If no feature name is provided, list features in .ai/sdd/ and ask which one to use.
${extra}"""
`
}

function copilotPrompt(cmd: SddPhaseCommand): string {
  const extra = cmd.phase === 4
    ? `\nAfter generating plans, also run the evaluation generation skill:\nRead and follow the skill at \`.ai/skills/evaluation-generation-skill/SKILL.md\`\nApply it to the same feature.\n`
    : ''
  return `---
description: "Phase ${cmd.phase}: ${cmd.description}"
---

Read and follow the skill at \`.ai/skills/${cmd.skillDir}/SKILL.md\`
Apply it to the feature specified or ask which feature to use by listing directories in \`.ai/sdd/\`.
${extra}`
}

function antigravityWorkflow(cmd: SddPhaseCommand): string {
  const extra = cmd.phase === 4
    ? `4. After generating plans, also run the evaluation generation skill:\n   Read and follow \`.ai/skills/evaluation-generation-skill/SKILL.md\` for the same feature.\n`
    : ''
  return `---
description: "Phase ${cmd.phase}: ${cmd.description}"
---

# SDD: ${cmd.phaseName}

1. Read the skill at \`.ai/skills/${cmd.skillDir}/SKILL.md\`
2. Apply it to the feature at \`.ai/sdd/$ARGUMENTS/\`
3. If no feature name is provided, list features in \`.ai/sdd/\` and ask which one to use.
${extra}`
}

// ─── AI.md Append Block ─────────────────────────────────────────────

const AI_MD_APPEND = `

## SDD Toolkit

This project uses a Spec-Driven Development workflow managed by the \`dotai sdd\` toolkit.

Read \`.ai/sdd/README.md\` at the start of every session before writing any code for a feature that has an entry in \`.ai/sdd/\`.

The SDD workflow uses skills located at \`.ai/skills/\`. Each phase specifies which skill to use. Always read the relevant skill file before starting a phase — do not rely on memory of what the skill does.

Never modify files in \`.ai/sdd/<feature-name>/evaluation/\` after Phase 4 is approved unless the developer explicitly instructs you to. These files are the contract for automated evaluation.
`

// ─── Phase Detection ────────────────────────────────────────────────

export interface FeaturePhaseInfo {
  name: string
  phase: number
  phaseName: string
  taskCount: number
  planCount: number
  evaluationCount: number  // .evaluation.md files (criteria)
  resultCount: number       // .result.md files (evaluated)
  passCount: number         // .result.md files with PASS verdict
  allPassed: boolean
  hasCodeReview: boolean
}

/**
 * Detect the current phase of a feature based on which files exist.
 */
export async function detectFeaturePhase(featurePath: string): Promise<FeaturePhaseInfo> {
  const name = featurePath.split('/').pop() || 'unknown'

  const info: FeaturePhaseInfo = {
    name,
    phase: 0,
    phaseName: 'Empty',
    taskCount: 0,
    planCount: 0,
    evaluationCount: 0,
    resultCount: 0,
    passCount: 0,
    allPassed: false,
    hasCodeReview: false,
  }

  // Phase 1: idea.md exists
  if (await pathExists(join(featurePath, 'idea.md'))) {
    info.phase = 1
    info.phaseName = 'Initiate'
  }

  // Phase 2: requirements.md has real content (not just placeholder)
  const reqPath = join(featurePath, 'requirements.md')
  if (await pathExists(reqPath)) {
    const content = await readTextFile(reqPath)
    const isPlaceholder = content.includes('This file is generated by the Requirements Agent')
      && !content.includes('## Functional Requirements')
    if (!isPlaceholder) {
      info.phase = 2
      info.phaseName = 'Specify'
    }
  }

  // Phase 3: tasks/ has .task.md files
  const tasksDir = join(featurePath, 'tasks')
  if (await pathExists(tasksDir)) {
    const taskFiles = (await readdir(tasksDir)).filter(f => f.endsWith('.task.md'))
    info.taskCount = taskFiles.length
    if (taskFiles.length > 0) {
      info.phase = 3
      info.phaseName = 'Decompose'
    }
  }

  // Phase 4: plans/ has .plan.md files AND evaluation/ has .evaluation.md files
  const plansDir = join(featurePath, 'plans')
  const evalDir = join(featurePath, 'evaluation')

  if (await pathExists(plansDir)) {
    const planFiles = (await readdir(plansDir)).filter(f => f.endsWith('.plan.md'))
    info.planCount = planFiles.length
  }
  if (await pathExists(evalDir)) {
    const evalFiles = (await readdir(evalDir)).filter(f => f.endsWith('.evaluation.md'))
    info.evaluationCount = evalFiles.length
    const resultFiles = (await readdir(evalDir)).filter(f => f.endsWith('.result.md'))
    info.resultCount = resultFiles.length

    // Count PASS verdicts by reading each result file
    let passCount = 0
    for (const rf of resultFiles) {
      const resultContent = await readTextFile(join(evalDir, rf))
      // Look for PASS verdict (case-insensitive, common patterns)
      if (/overall\s+verdict[:\s]*pass/i.test(resultContent)
        || /verdict[:\s]*\*\*?pass\*\*?/i.test(resultContent)
        || /^#+.*\bpass\b/im.test(resultContent)) {
        passCount++
      }
    }
    info.passCount = passCount
  }

  if (info.planCount > 0 && info.evaluationCount > 0) {
    info.phase = 4
    info.phaseName = 'Plan'
  }

  // Phase 5: Implementation is in progress when at least one .result.md exists
  // (a result file means the task was implemented and then evaluated).
  // Phase 5 is "complete" only when ALL tasks have result files.
  if (info.resultCount > 0 && info.taskCount > 0) {
    if (info.resultCount >= info.taskCount) {
      // All tasks have been implemented and evaluated — Phase 5 is complete
      info.phase = 5
      info.phaseName = 'Implement'
    } else {
      // Partial: some tasks implemented and evaluated, but not all
      info.phase = 5
      info.phaseName = 'Implement'
    }
  }

  // Phase 6: All tasks have results AND all passed
  if (info.resultCount > 0 && info.taskCount > 0
    && info.resultCount >= info.taskCount && info.passCount >= info.taskCount) {
    info.allPassed = true
    info.phase = 6
    info.phaseName = 'Evaluate'
  }

  // Phase 7: code-review.md exists
  if (await pathExists(join(featurePath, 'code-review.md'))) {
    info.hasCodeReview = true
    info.phase = 7
    info.phaseName = 'Review'
  }

  return info
}

/**
 * Get all feature directories inside .ai/sdd/ (excluding _template-feature and README.md).
 */
export async function listFeatures(sddPath: string): Promise<string[]> {
  if (!(await pathExists(sddPath))) return []

  const entries = await readdir(sddPath, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && e.name !== '_template-feature')
    .map(e => e.name)
    .sort()
}

// ─── Scaffold Functions ─────────────────────────────────────────────

interface SddInitResult {
  createdFiles: string[]
  skippedFiles: string[]
}

/**
 * Scaffold the full SDD toolkit: skills, sdd directory, commands, AI.md append.
 */
export async function scaffoldSdd(
  projectRoot: string,
  aiDir: string,
  options: { force?: boolean }
): Promise<SddInitResult> {
  const aiPath = join(projectRoot, aiDir)
  const sddPath = join(aiPath, 'sdd')
  const skillsPath = join(aiPath, 'skills')
  const result: SddInitResult = { createdFiles: [], skippedFiles: [] }

  const force = options.force || false

  // Helper: write file if not exists (or if force)
  async function writeIfNeeded(filePath: string, content: string, label: string): Promise<void> {
    if (!force && (await pathExists(filePath))) {
      result.skippedFiles.push(label)
      return
    }
    await writeTextFile(filePath, content)
    result.createdFiles.push(label)
    logger.success(label)
  }

  // 1. Write 8 skill files
  await ensureDir(skillsPath)
  for (const skill of SDD_SKILLS) {
    const skillDir = join(skillsPath, skill.dirName)
    await ensureDir(skillDir)
    await writeIfNeeded(
      join(skillDir, 'SKILL.md'),
      skill.getContent(),
      `${aiDir}/skills/${skill.dirName}/SKILL.md`
    )
  }

  // 2. Create .ai/sdd/ structure
  await ensureDir(sddPath)
  await writeIfNeeded(join(sddPath, 'README.md'), sddReadme(), `${aiDir}/sdd/README.md`)

  // 3. Create template feature
  const templatePath = join(sddPath, '_template-feature')
  await ensureDir(templatePath)
  await ensureDir(join(templatePath, 'tasks'))
  await ensureDir(join(templatePath, 'plans'))
  await ensureDir(join(templatePath, 'evaluation'))

  await writeIfNeeded(join(templatePath, 'idea.md'), templateIdeaMd(), `${aiDir}/sdd/_template-feature/idea.md`)
  await writeIfNeeded(join(templatePath, 'requirements.md'), templateRequirementsMd(), `${aiDir}/sdd/_template-feature/requirements.md`)

  // .gitkeep files
  for (const sub of ['tasks', 'plans', 'evaluation']) {
    const gk = join(templatePath, sub, '.gitkeep')
    if (!(await pathExists(gk))) {
      await writeTextFile(gk, '')
      result.createdFiles.push(`${aiDir}/sdd/_template-feature/${sub}/.gitkeep`)
    }
  }

  // 4. Write cross-tool commands
  for (const cmd of SDD_PHASE_COMMANDS) {
    // Claude commands
    await writeIfNeeded(
      join(aiPath, 'commands', `${cmd.name}.md`),
      claudeCommand(cmd),
      `${aiDir}/commands/${cmd.name}.md`
    )

    // Gemini CLI commands
    await writeIfNeeded(
      join(aiPath, 'commands-gemini', `${cmd.name}.toml`),
      geminiCommand(cmd),
      `${aiDir}/commands-gemini/${cmd.name}.toml`
    )

    // Copilot prompts
    await writeIfNeeded(
      join(aiPath, 'prompts', `${cmd.name}.prompt.md`),
      copilotPrompt(cmd),
      `${aiDir}/prompts/${cmd.name}.prompt.md`
    )

    // Antigravity workflows
    await writeIfNeeded(
      join(aiPath, 'workflows', `${cmd.name}.md`),
      antigravityWorkflow(cmd),
      `${aiDir}/workflows/${cmd.name}.md`
    )
  }

  // 5. Append to AI.md
  const aiMdPath = join(aiPath, 'AI.md')
  if (await pathExists(aiMdPath)) {
    const content = await readTextFile(aiMdPath)
    if (!content.includes('## SDD Toolkit')) {
      await writeTextFile(aiMdPath, content + AI_MD_APPEND)
      result.createdFiles.push(`${aiDir}/AI.md (appended SDD block)`)
      logger.success(`${aiDir}/AI.md (appended SDD block)`)
    } else {
      result.skippedFiles.push(`${aiDir}/AI.md (SDD block already present)`)
    }
  }

  return result
}

/**
 * Create a new feature directory from the template.
 */
export async function createFeature(sddPath: string, featureName: string, aiDir: string): Promise<string[]> {
  const templatePath = join(sddPath, '_template-feature')
  const featurePath = join(sddPath, featureName)
  const createdFiles: string[] = []

  // Create feature directory structure
  await ensureDir(featurePath)
  await ensureDir(join(featurePath, 'tasks'))
  await ensureDir(join(featurePath, 'plans'))
  await ensureDir(join(featurePath, 'evaluation'))

  // Copy template files
  const ideaContent = (await pathExists(join(templatePath, 'idea.md')))
    ? await readTextFile(join(templatePath, 'idea.md'))
    : templateIdeaMd()

  const reqContent = (await pathExists(join(templatePath, 'requirements.md')))
    ? await readTextFile(join(templatePath, 'requirements.md'))
    : templateRequirementsMd()

  await writeTextFile(join(featurePath, 'idea.md'), ideaContent)
  createdFiles.push(`${aiDir}/sdd/${featureName}/idea.md`)

  await writeTextFile(join(featurePath, 'requirements.md'), reqContent)
  createdFiles.push(`${aiDir}/sdd/${featureName}/requirements.md`)

  // .gitkeep files
  for (const sub of ['tasks', 'plans', 'evaluation']) {
    await writeTextFile(join(featurePath, sub, '.gitkeep'), '')
    createdFiles.push(`${aiDir}/sdd/${featureName}/${sub}/.gitkeep`)
  }

  return createdFiles
}

/**
 * Validate a feature name: lowercase kebab-case, no spaces, no underscores.
 */
export function validateFeatureName(name: string): string | null {
  if (!name) return 'Feature name is required'
  if (name.startsWith('_')) return "Feature name cannot start with '_' (reserved for templates)"
  if (name !== name.toLowerCase()) return 'Feature name must be lowercase'
  if (/\s/.test(name)) return 'Feature name cannot contain spaces (use kebab-case)'
  if (/_/.test(name)) return 'Feature name cannot contain underscores (use kebab-case)'
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return 'Feature name must be lowercase kebab-case (e.g., my-feature-name)'
  return null
}
