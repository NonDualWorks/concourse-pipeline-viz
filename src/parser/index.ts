// Main parser entry — Concourse YAML string → ParsedPipeline

import yaml from 'js-yaml'
import type { ConcoursePipeline, ParsedPipeline, ParsedJob } from './types'
import { buildResourceMap, walkPlan } from './walker'
import { extractDependencies } from './dependencies'
import { computeColumns, detectParallelGroups, inferTiming } from './layout'
import { inferZones } from './zones'

export interface ParseWarning {
  message: string
  job?: string
}

export interface ParseResult {
  pipeline: ParsedPipeline
  warnings: ParseWarning[]
}

export function parseConcourseYAML(
  yamlString: string,
  opts?: { name?: string; team?: string; color?: string },
): ParseResult {
  const warnings: ParseWarning[] = []

  // Parse YAML
  let raw: ConcoursePipeline
  try {
    raw = yaml.load(yamlString) as ConcoursePipeline
  } catch (e) {
    throw new Error(`YAML parse error: ${(e as Error).message}`)
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid pipeline: expected a YAML object')
  }
  if (!raw.jobs || !Array.isArray(raw.jobs) || raw.jobs.length === 0) {
    throw new Error('No jobs found in pipeline')
  }

  // Build resource lookup
  const resourceMap = buildResourceMap(raw.resources || [])

  // Parse each job
  const parsedJobs: ParsedJob[] = []
  const jobNames = new Set(raw.jobs.map(j => j.name))

  for (const cJob of raw.jobs) {
    if (!cJob.name) {
      warnings.push({ message: 'Job without a name found, skipping' })
      continue
    }
    if (!cJob.plan || !Array.isArray(cJob.plan)) {
      warnings.push({ message: `Job "${cJob.name}" has no plan, skipping`, job: cJob.name })
      continue
    }

    // Walk steps
    const steps = walkPlan(cJob.plan, resourceMap)

    // Extract dependencies
    const rawDeps = extractDependencies(cJob.plan)
    // Filter to only jobs that actually exist
    const depends_on = rawDeps.filter(d => {
      if (!jobNames.has(d)) {
        warnings.push({ message: `Job "${cJob.name}" depends on "${d}" which is not defined`, job: cJob.name })
        return false
      }
      return true
    })

    // Walk job-level hooks
    const jobHookSteps = []
    for (const [hookKey] of [['on_success'], ['on_failure'], ['on_abort'], ['on_error'], ['ensure']] as const) {
      const hookStep = (cJob as unknown as Record<string, unknown>)[hookKey]
      if (hookStep) {
        const hookResults = walkPlan([hookStep as never], resourceMap)
        // Re-tag context for job-level hooks
        for (const s of hookResults) {
          s.context = hookKey as typeof s.context
          s.depth = Math.max(s.depth, 1)
        }
        jobHookSteps.push(...hookResults)
      }
    }

    parsedJobs.push({
      name: cJob.name,
      depends_on,
      parallelGroup: null,
      row: 0,
      zone: null,
      steps: [...steps, ...jobHookSteps],
      timing: inferTiming(steps.length),
    })
  }

  // Layout
  const columns = computeColumns(parsedJobs)
  detectParallelGroups(parsedJobs, columns)

  // Sort jobs by column, then by row within parallel groups
  parsedJobs.sort((a, b) => {
    const ca = columns[a.name] ?? 0
    const cb = columns[b.name] ?? 0
    if (ca !== cb) return ca - cb
    return a.row - b.row
  })

  // Zones from Concourse groups
  const zones = inferZones(raw.groups, parsedJobs)

  return {
    pipeline: {
      name: opts?.name || 'pipeline',
      team: opts?.team || 'team',
      color: opts?.color || '#10b981',
      jobs: parsedJobs,
      zones,
    },
    warnings,
  }
}
