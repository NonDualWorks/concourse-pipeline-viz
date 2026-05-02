// Extract job dependencies from get.passed constraints

import type { ConcourseStep } from './types'

/** Recursively collect all `passed` arrays from get steps in a plan tree */
function collectPassed(step: ConcourseStep, result: Set<string>): void {
  // Leaf: get step with passed constraint
  if (step.get !== undefined && step.passed) {
    for (const dep of step.passed) {
      result.add(dep)
    }
  }

  // Containers: recurse into children
  if (step.do) {
    for (const child of step.do) collectPassed(child, result)
  }
  if (step.in_parallel) {
    const children = Array.isArray(step.in_parallel)
      ? step.in_parallel
      : (step.in_parallel.steps || [])
    for (const child of children) collectPassed(child, result)
  }
  if (step.try) {
    collectPassed(step.try, result)
  }

  // Hooks
  if (step.on_success) collectPassed(step.on_success, result)
  if (step.on_failure) collectPassed(step.on_failure, result)
  if (step.on_abort) collectPassed(step.on_abort, result)
  if (step.on_error) collectPassed(step.on_error, result)
  if (step.ensure) collectPassed(step.ensure, result)
}

/** Extract depends_on for a job from its plan steps */
export function extractDependencies(plan: ConcourseStep[]): string[] {
  const deps = new Set<string>()
  for (const step of plan) {
    collectPassed(step, deps)
  }
  return Array.from(deps)
}
