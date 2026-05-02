// GSAP animation engine — adapted from pipeline-composer
// Drives motion, timing, sequencing for Concourse pipeline visualization

import gsap from 'gsap'
import { VIS, TIMING_TOKENS } from './constants'
import type { PipelineComponent } from './renderer'
import type { ParsedJob } from '../parser/types'

// ─── State animation helpers ───

function animJob(comp: PipelineComponent, name: string, state: string) {
  const el = comp.getJobEl(name) as HTMLElement | null
  if (!el) return
  const v = VIS[state as keyof typeof VIS] || VIS.idle

  gsap.to(el, { borderColor: v.border, duration: 0.25, ease: 'power2.out' })
  const hdr = el.querySelector('.job-header') as HTMLElement | null
  if (hdr) gsap.to(hdr, { backgroundColor: v.header, duration: 0.25 })
  const nm = el.querySelector('.job-name-j') as HTMLElement | null
  if (nm) gsap.to(nm, { color: v.name, duration: 0.25 })

  const sp = el.querySelector('.spinner-j') as HTMLElement | null
  const dot = el.querySelector('.s-dot-j') as HTMLElement | null
  if (sp && dot) {
    if (state === 'running') {
      gsap.to(sp, { opacity: 1, duration: 0.15 })
      gsap.to(dot, { opacity: 0, duration: 0.15 })
    } else {
      gsap.to(sp, { opacity: 0, duration: 0.15 })
      gsap.to(dot, { opacity: 1, duration: 0.15, backgroundColor: v.border })
    }
  }

  if (state === 'succeeded') {
    gsap.timeline()
      .to(el, { scale: 1.02, duration: 0.1, ease: 'power2.out' })
      .to(el, { scale: 1, duration: 0.2, ease: 'elastic.out(1,.5)' })
  }
  if (state === 'failed') {
    gsap.timeline()
      .to(el, { x: -3, duration: 0.05 })
      .to(el, { x: 3, duration: 0.05 })
      .to(el, { x: -2, duration: 0.05 })
      .to(el, { x: 0, duration: 0.05 })
  }
}

function animStep(comp: PipelineComponent, name: string, si: number, state: string) {
  const el = comp.getStepEl(name, si) as HTMLElement | null
  if (!el) return
  if (state === 'running') {
    gsap.to(el, { opacity: 1, backgroundColor: 'rgba(255,255,255,0.03)', duration: 0.12 })
    const lb = el.querySelector('.step-lbl-j') as HTMLElement | null
    if (lb) gsap.to(lb, { color: '#f4f4f5', duration: 0.12 })
  } else if (state === 'done') {
    gsap.to(el, { opacity: 1, backgroundColor: 'transparent', duration: 0.12 })
    const lb = el.querySelector('.step-lbl-j') as HTMLElement | null
    if (lb) gsap.to(lb, { color: '#a1a1aa', duration: 0.12 })
  } else if (state === 'failed') {
    gsap.to(el, { opacity: 1, backgroundColor: 'rgba(237,75,53,0.06)', duration: 0.12 })
    const lb = el.querySelector('.step-lbl-j') as HTMLElement | null
    if (lb) gsap.to(lb, { color: '#ed4b35', duration: 0.12 })
  }
}

function drawConn(host: HTMLElement, selector: string, color: string, duration = 0.5) {
  const el = host.querySelector(selector) as SVGPathElement | null
  if (!el) return
  const len = el.getTotalLength ? el.getTotalLength() : 80
  gsap.set(el, { strokeDasharray: len, strokeDashoffset: len })
  gsap.to(el, { strokeDashoffset: 0, stroke: color, duration, ease: 'power2.inOut' })
}

function animRC(host: HTMLElement, selector: string, color: string, glow = false) {
  const el = host.querySelector(`[data-rc="${selector}"]`) as SVGElement | null
  if (!el) return
  gsap.to(el, { fill: color, filter: glow ? `drop-shadow(0 0 5px ${color})` : 'none', duration: 0.4 })
}

// ─── Timeline builder ───

export interface AnimationResult {
  success: boolean
}

export interface TimelineOptions {
  speed: number
  replayDelay?: number
  onDone?: (result: AnimationResult) => void
  onReplay?: () => void
}

export function buildTimeline(
  host: HTMLElement,
  comp: PipelineComponent,
  jobs: ParsedJob[],
  opts: TimelineOptions,
): gsap.core.Timeline {
  const { onDone, onReplay } = opts
  const replayDelay = opts.replayDelay ?? 3500

  const tl = gsap.timeline({ paused: true })
  const jmap: Record<string, number> = {}
  jobs.forEach((j, i) => jmap[j.name] = i)
  const jEnd: Record<number, number> = {}
  const gStart: Record<string, number> = {}
  let cursor = 0.4

  // Pre-calculate parallel group start times
  jobs.forEach(j => {
    const grpKey = j.parallelGroup
    if (!grpKey) return
    let gs = 0.4
    for (const dep of (j.depends_on || [])) {
      const di = jmap[dep]
      if (di !== undefined && jEnd[di] !== undefined) gs = Math.max(gs, jEnd[di] + 0.3)
    }
    if (gStart[grpKey] === undefined || gs > gStart[grpKey]) gStart[grpKey] = gs
  })

  // Animate source circle at start
  tl.call(() => animRC(host, 'source', '#f5a623', true), [], 0.1)

  jobs.forEach((job, ji) => {
    const grpKey = job.parallelGroup
    let jstart = grpKey ? (gStart[grpKey] ?? cursor) : cursor
    for (const dep of (job.depends_on || [])) {
      const di = jmap[dep]
      if (di !== undefined && jEnd[di] !== undefined) jstart = Math.max(jstart, jEnd[di] + 0.3)
    }
    const sc = job.steps?.length || 0
    const jdur = (TIMING_TOKENS[job.timing] || (300 + sc * 480)) / 1000

    jEnd[ji] = jstart + jdur

    const depFailed = () => (job.depends_on || []).some(d => {
      const di = jmap[d]
      return di !== undefined && comp._js?.[jobs[di]?.name] !== 'succeeded'
    })

    // Pending
    tl.call(() => {
      if (!depFailed()) { comp.setJobState(job.name, 'pending'); animJob(comp, job.name, 'pending') }
    }, [], jstart - 0.2)

    // Draw input connector
    tl.call(() => {
      if (!depFailed()) drawConn(host, `[data-conn-in="${job.name}"]`, '#f5a623', 0.5)
    }, [], jstart - 0.1)

    // Running
    tl.call(() => {
      if (!depFailed()) { comp.setJobState(job.name, 'running'); animJob(comp, job.name, 'running') }
    }, [], jstart)

    // Steps — activate sequentially
    const stepCount = job.steps?.length || 0
    if (stepCount > 0) {
      let sc2 = jstart + 0.2
      const sd = (jdur - 0.3) / Math.max(stepCount, 1)
      job.steps.forEach((_step, si) => {
        tl.call(() => {
          if (comp._js?.[job.name] === 'running') {
            comp.setStepState(job.name, si, 'running')
            animStep(comp, job.name, si, 'running')
          }
        }, [], sc2)
        sc2 += sd * 0.65
        tl.call(() => {
          if (comp._js?.[job.name] === 'running') {
            comp.setStepState(job.name, si, 'done')
            animStep(comp, job.name, si, 'done')
          }
        }, [], sc2)
        sc2 += sd * 0.35
      })
    }

    // Job success
    tl.call(() => {
      if (depFailed()) return
      comp.setJobState(job.name, 'succeeded'); animJob(comp, job.name, 'succeeded')
      drawConn(host, `[data-conn-out="${job.name}"]`, '#11c560', 0.5)

      const mergeIdx = findMergeIndex(jobs, job)

      if (job.parallelGroup) {
        // Handle parallel group merge — wait for all jobs in group
        const grp = jobs.filter(j => j.parallelGroup === job.parallelGroup)
        const allDone = grp.every(g => ['succeeded', 'failed'].includes(comp._js?.[g.name] || ''))
        if (!allDone) return
        const allOk = grp.every(g => comp._js?.[g.name] === 'succeeded')
        if (allOk) {
          animRC(host, `merge-${mergeIdx}`, '#11c560', true)
          const bridge = host.querySelector(`[data-conn-bridge="${mergeIdx}"]`)
          if (bridge) gsap.to(bridge, { stroke: '#11c560', duration: 0.4 })
        }
      } else {
        // Single-job column — animate merge circle + bridge directly
        animRC(host, `merge-${mergeIdx}`, '#11c560', true)
        const bridge = host.querySelector(`[data-conn-bridge="${mergeIdx}"]`)
        if (bridge) gsap.to(bridge, { stroke: '#11c560', duration: 0.4 })
      }
    }, [], jEnd[ji])

    if (!job.parallelGroup) cursor = jstart + 0.2
  })

  // Pipeline done
  const totalEnd = Math.max(...Object.values(jEnd), cursor) + 0.4
  tl.call(() => {
    const anyFail = Object.values(comp._js || {}).some(s => s === 'failed')
    animRC(host, 'trail', anyFail ? '#ed4b35' : '#38bdf8', !anyFail)
    if (onDone) onDone({ success: !anyFail })
    if (onReplay) setTimeout(onReplay, replayDelay)
  }, [], totalEnd)

  return tl
}

function findMergeIndex(jobs: ParsedJob[], job: ParsedJob): number {
  const seen: Record<string, number> = {}
  let ci = 0
  for (const j of jobs) {
    const g = j.parallelGroup || `_${jobs.indexOf(j)}`
    if (!(g in seen)) { seen[g] = ci++ }
    if (j.name === job.name) return seen[g]
  }
  return 0
}
