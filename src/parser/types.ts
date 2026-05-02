// ─── Raw Concourse YAML types ───

export interface ConcourseResource {
  name: string
  type: string
  source?: Record<string, unknown>
}

export interface ConcourseJob {
  name: string
  plan: ConcourseStep[]
  serial?: boolean
  serial_groups?: string[]
  on_success?: ConcourseStep
  on_failure?: ConcourseStep
  on_abort?: ConcourseStep
  on_error?: ConcourseStep
  ensure?: ConcourseStep
}

export interface ConcourseGroup {
  name: string
  jobs: string[]
}

export interface ConcoursePipeline {
  resources?: ConcourseResource[]
  jobs: ConcourseJob[]
  groups?: ConcourseGroup[]
}

// Concourse steps are recursive: each step may be a leaf (get/put/task)
// or a container (do/in_parallel/try) with hooks on any step.
export interface ConcourseStep {
  get?: string
  put?: string
  task?: string
  set_pipeline?: string
  load_var?: string
  do?: ConcourseStep[]
  in_parallel?: ConcourseStep[] | { steps: ConcourseStep[]; limit?: number; fail_fast?: boolean }
  try?: ConcourseStep
  across?: Array<{ var: string; values?: unknown[] }>

  // Leaf modifiers
  resource?: string       // aliased resource name for get/put
  passed?: string[]       // dependency constraint on get
  trigger?: boolean
  params?: Record<string, unknown>
  inputs?: unknown
  outputs?: unknown

  // Hooks (present on any step)
  on_success?: ConcourseStep
  on_failure?: ConcourseStep
  on_abort?: ConcourseStep
  on_error?: ConcourseStep
  ensure?: ConcourseStep
}

// ─── Parsed output types ───

export type StepContext =
  | 'sequential'
  | 'parallel'
  | 'on_success'
  | 'on_failure'
  | 'on_abort'
  | 'on_error'
  | 'ensure'
  | 'try'

export interface DisplayStep {
  label: string
  type: 'resource' | 'task'
  resourceType?: string   // for coloring resource dots
  depth: number           // nesting level (0 = top-level plan)
  context: StepContext     // enclosing container type
}

export interface ParsedJob {
  name: string
  depends_on: string[]
  parallelGroup: string | null
  row: number
  zone: string | null
  steps: DisplayStep[]
  timing: string            // flash | quick | steady | slow | crawl
}

export interface ParsedZone {
  id: string
  label: string
  color: string
}

export interface ParsedPipeline {
  name: string
  team: string
  color: string
  jobs: ParsedJob[]
  zones: ParsedZone[]
}
