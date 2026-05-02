// Concourse groups → visual zones

import type { ConcourseGroup } from './types'
import type { ParsedJob, ParsedZone } from './types'

const ZONE_PALETTE = [
  '#10b981', // emerald
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#f5a623', // amber
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#fbbf24', // yellow
  '#6366f1', // indigo
]

/** Convert Concourse groups into visual zones and annotate jobs */
export function inferZones(
  groups: ConcourseGroup[] | undefined,
  jobs: ParsedJob[],
): ParsedZone[] {
  if (!groups || groups.length === 0) return []

  const zones: ParsedZone[] = []
  const jobZoneMap: Record<string, string> = {}

  groups.forEach((g, i) => {
    const zoneId = g.name
    const color = ZONE_PALETTE[i % ZONE_PALETTE.length]
    zones.push({
      id: zoneId,
      label: g.name,
      color,
    })
    for (const jobName of g.jobs) {
      jobZoneMap[jobName] = zoneId
    }
  })

  // Annotate jobs with zone
  for (const job of jobs) {
    if (jobZoneMap[job.name]) {
      job.zone = jobZoneMap[job.name]
    }
  }

  return zones
}
