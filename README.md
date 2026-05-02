# concourse-pipeline-viz

Animated visualizer for Concourse CI pipelines. Paste real pipeline YAML, see the job dependency graph come alive.

## What it does

Parses actual Concourse pipeline YAML and produces an animated visualization showing:

- Job dependency graph with topological column layout
- Parallel job detection (jobs at the same dependency depth)
- Step-by-step execution animation within each job
- Concourse groups rendered as visual zones
- All Concourse step types: `get`, `put`, `task`, `set_pipeline`, `load_var`
- Container steps: `do`, `in_parallel`, `try`
- Hooks: `on_success`, `on_failure`, `on_abort`, `on_error`, `ensure`
- SVG connector lines with bezier curves between jobs
- Concourse-accurate state colors (idle, pending, running, succeeded, failed)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — a sample pipeline is pre-loaded and auto-animates.

## Usage

1. Paste any Concourse `pipeline.yml` into the left panel
2. Click **Animate** (or press `Cmd+Enter`)
3. Use the speed slider to control animation pace
4. Switch between sample pipelines using the dropdown

## Architecture

```
Concourse YAML string
  → js-yaml.load()
  → Parser: walk step tree, extract dependencies, infer layout
  → Renderer: two-phase HTML + SVG overlay
  → Animator: GSAP timeline
  → Output: animated pipeline visualization
```

### Parser (`src/parser/`)

- **walker.ts** — Recursive step walker that flattens Concourse's nested plan tree
- **dependencies.ts** — Extracts `depends_on` from `get.passed` constraints
- **layout.ts** — Topological column assignment + parallel group detection
- **zones.ts** — Maps Concourse `groups` to visual zones
- **index.ts** — Orchestrates parsing pipeline

### Engine (`src/engine/`)

- **renderer.ts** — Two-phase DOM renderer (HTML layout → measure → SVG connectors)
- **animator.ts** — GSAP timeline builder for job/step state transitions
- **constants.ts** — Concourse state colors, resource type colors, timing tokens

## Concourse step types handled

| Step | Parser action |
|------|--------------|
| `get` | Leaf → resource dot with type-based color |
| `put` | Leaf → resource dot |
| `task` | Leaf → task dot |
| `set_pipeline` | Leaf → task dot |
| `load_var` | Leaf → task dot |
| `do` | Container → recurse, sequential context |
| `in_parallel` | Container → recurse, parallel context (array + config forms) |
| `try` | Container → recurse, try context |
| hooks | Recurse with hook name as context |

## Stack

- **Vite** + **TypeScript** — build tooling
- **js-yaml** — YAML parsing
- **GSAP** (free core) — animation engine
- No framework — vanilla DOM for minimal footprint

## License

MIT
