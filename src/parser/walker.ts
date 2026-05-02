// Recursive step walker — traverses Concourse plan tree into flat DisplayStep[]

import type { ConcourseStep, ConcourseResource, DisplayStep, StepContext } from './types'

/** Build a resource-name → resource-type map from the pipeline's resources array */
export function buildResourceMap(resources: ConcourseResource[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const r of resources) {
    map[r.name] = r.type
  }
  return map
}

/** Detect which step type key is present on a Concourse step */
type StepKind = 'get' | 'put' | 'task' | 'set_pipeline' | 'load_var' | 'do' | 'in_parallel' | 'try' | 'unknown'

function detectStepKind(step: ConcourseStep): StepKind {
  if (step.get !== undefined) return 'get'
  if (step.put !== undefined) return 'put'
  if (step.task !== undefined) return 'task'
  if (step.set_pipeline !== undefined) return 'set_pipeline'
  if (step.load_var !== undefined) return 'load_var'
  if (step.do !== undefined) return 'do'
  if (step.in_parallel !== undefined) return 'in_parallel'
  if (step.try !== undefined) return 'try'
  return 'unknown'
}

/** Format the across modifier as a suffix */
function acrossSuffix(step: ConcourseStep): string {
  if (!step.across || step.across.length === 0) return ''
  const vars = step.across.map(a => a.var).join(', ')
  return ` [across: ${vars}]`
}

/** Walk a single Concourse step recursively, appending to result */
function walkStep(
  step: ConcourseStep,
  resourceMap: Record<string, string>,
  depth: number,
  context: StepContext,
  result: DisplayStep[],
): void {
  const kind = detectStepKind(step)
  const across = acrossSuffix(step)

  switch (kind) {
    case 'get': {
      const name = step.get!
      const actualResource = step.resource || name
      const resType = resourceMap[actualResource] || 'unknown'
      result.push({
        label: `get: ${name}${across}`,
        type: 'resource',
        resourceType: resType,
        depth,
        context,
      })
      break
    }
    case 'put': {
      const name = step.put!
      const actualResource = step.resource || name
      const resType = resourceMap[actualResource] || 'unknown'
      result.push({
        label: `put: ${name}${across}`,
        type: 'resource',
        resourceType: resType,
        depth,
        context,
      })
      break
    }
    case 'task': {
      result.push({
        label: `task: ${step.task!}${across}`,
        type: 'task',
        depth,
        context,
      })
      break
    }
    case 'set_pipeline': {
      result.push({
        label: `set_pipeline: ${step.set_pipeline!}${across}`,
        type: 'task',
        depth,
        context,
      })
      break
    }
    case 'load_var': {
      result.push({
        label: `load_var: ${step.load_var!}${across}`,
        type: 'task',
        depth,
        context,
      })
      break
    }
    case 'do': {
      const children = step.do!
      for (const child of children) {
        walkStep(child, resourceMap, depth + 1, 'sequential', result)
      }
      break
    }
    case 'in_parallel': {
      const par = step.in_parallel!
      const children = Array.isArray(par) ? par : (par.steps || [])
      for (const child of children) {
        walkStep(child, resourceMap, depth + 1, 'parallel', result)
      }
      break
    }
    case 'try': {
      walkStep(step.try!, resourceMap, depth + 1, 'try', result)
      break
    }
    default: {
      // Unknown step type — emit a placeholder
      result.push({
        label: `unknown step`,
        type: 'task',
        depth,
        context,
      })
    }
  }

  // Walk hooks on this step
  const hooks: [string, StepContext][] = [
    ['on_success', 'on_success'],
    ['on_failure', 'on_failure'],
    ['on_abort', 'on_abort'],
    ['on_error', 'on_error'],
    ['ensure', 'ensure'],
  ]
  for (const [key, ctx] of hooks) {
    const hookStep = (step as Record<string, unknown>)[key] as ConcourseStep | undefined
    if (hookStep) {
      walkStep(hookStep, resourceMap, depth + 1, ctx as StepContext, result)
    }
  }
}

/** Walk a job's entire plan tree into a flat DisplayStep array */
export function walkPlan(
  plan: ConcourseStep[],
  resourceMap: Record<string, string>,
): DisplayStep[] {
  const result: DisplayStep[] = []
  for (const step of plan) {
    walkStep(step, resourceMap, 0, 'sequential', result)
  }
  return result
}
