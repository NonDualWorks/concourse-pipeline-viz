// Resource circle colors — match Concourse UI
export const RC_COLORS: Record<string, string> = {
  git: '#f5a623',
  'registry-image': '#38bdf8',
  'docker-image': '#38bdf8',
  s3: '#fbbf24',
  semver: '#a78bfa',
  'slack-notification': '#10b981',
  time: '#71717a',
  pool: '#a78bfa',
  mock: '#71717a',
  unknown: '#71717a',
}

// Timing token durations in ms
export const TIMING_TOKENS: Record<string, number> = {
  flash: 400,
  quick: 800,
  steady: 1400,
  slow: 2200,
  crawl: 3000,
}

// State colors — exact Concourse UI match
export const STATE_COLORS = {
  idle: '#3d3d3d',
  pending: '#8b572a',
  running: '#f5a623',
  succeeded: '#11c560',
  failed: '#ed4b35',
} as const

// Visual styles per state
export const VIS = {
  idle:      { border: '#3d3d3d', header: 'rgba(0,0,0,0.2)',       name: '#71717a' },
  pending:   { border: '#8b572a', header: 'rgba(139,87,42,0.10)',   name: '#8b572a' },
  running:   { border: '#f5a623', header: 'rgba(245,166,35,0.10)',  name: '#f5a623' },
  succeeded: { border: '#11c560', header: 'rgba(17,197,96,0.08)',   name: '#f4f4f5' },
  failed:    { border: '#ed4b35', header: 'rgba(237,75,53,0.08)',   name: '#ed4b35' },
} as const
