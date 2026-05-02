// Topological column assignment + parallel group detection

import type { ParsedJob } from './types'

interface LayoutInput {
  name: string
  depends_on: string[]
}

/** Assign column index to each job based on dependency depth */
export function computeColumns(jobs: LayoutInput[]): Record<string, number> {
  const nameToJob: Record<string, LayoutInput> = {}
  for (const j of jobs) nameToJob[j.name] = j

  const columns: Record<string, number> = {}
  const visiting = new Set<string>()

  function resolve(name: string): number {
    if (columns[name] !== undefined) return columns[name]
    if (visiting.has(name)) {
      // Cycle detected — break it
      columns[name] = 0
      return 0
    }
    visiting.add(name)

    const job = nameToJob[name]
    if (!job || job.depends_on.length === 0) {
      columns[name] = 0
    } else {
      let maxDep = -1
      for (const dep of job.depends_on) {
        if (nameToJob[dep]) {
          maxDep = Math.max(maxDep, resolve(dep))
        }
      }
      columns[name] = maxDep + 1
    }
    visiting.delete(name)
    return columns[name]
  }

  for (const j of jobs) resolve(j.name)
  return columns
}

/** Detect parallel groups: jobs at the same column with identical depends_on */
export function detectParallelGroups(
  jobs: ParsedJob[],
  columns: Record<string, number>,
): void {
  // Group by column
  const byColumn: Record<number, ParsedJob[]> = {}
  for (const j of jobs) {
    const col = columns[j.name] ?? 0
    if (!byColumn[col]) byColumn[col] = []
    byColumn[col].push(j)
  }

  let groupCounter = 0

  for (const col of Object.keys(byColumn).map(Number).sort((a, b) => a - b)) {
    const colJobs = byColumn[col]
    if (colJobs.length <= 1) continue

    // Sub-group by identical depends_on sets
    const subGroups: Record<string, ParsedJob[]> = {}
    for (const j of colJobs) {
      const key = [...j.depends_on].sort().join(',')
      if (!subGroups[key]) subGroups[key] = []
      subGroups[key].push(j)
    }

    for (const sg of Object.values(subGroups)) {
      if (sg.length <= 1) continue
      const groupName = `par-${groupCounter++}`
      sg.forEach((j, i) => {
        j.parallelGroup = groupName
        j.row = i
      })
    }
  }
}

/** Infer timing token from step count */
export function inferTiming(stepCount: number): string {
  if (stepCount <= 1) return 'flash'
  if (stepCount <= 2) return 'quick'
  if (stepCount <= 4) return 'steady'
  if (stepCount <= 6) return 'slow'
  return 'crawl'
}
