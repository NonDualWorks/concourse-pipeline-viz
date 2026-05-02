// Entry point — wire UI events to parser → engine

import './styles.css'
import { parseConcourseYAML } from './parser'
import { createPipelineComponent } from './engine/renderer'
import { buildTimeline } from './engine/animator'
import gsap from 'gsap'

// ─── DOM refs ───

const yamlInput = document.getElementById('yaml-input') as HTMLTextAreaElement
const btnAnimate = document.getElementById('btn-animate') as HTMLButtonElement
const btnReplay = document.getElementById('btn-replay') as HTMLButtonElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const vizOutput = document.getElementById('viz-output') as HTMLElement
const warningsEl = document.getElementById('warnings') as HTMLElement
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement
const speedVal = document.getElementById('speed-val') as HTMLElement
const speedPills = document.querySelectorAll<HTMLButtonElement>('.pill[data-speed]')

// ─── State ───

let currentTl: gsap.core.Timeline | null = null
let currentSpeed = 1

// ─── Speed control ───

function setSpeed(val: number) {
  currentSpeed = val
  speedSlider.value = String(val)
  speedVal.textContent = `${val.toFixed(1)}x`
  if (currentTl) currentTl.timeScale(1 / val)

  // Update pill active states
  speedPills.forEach(p => {
    p.classList.toggle('on', parseFloat(p.dataset.speed || '1') === val)
  })
}

speedSlider.addEventListener('input', () => {
  const val = parseFloat(speedSlider.value)
  setSpeed(val)
})

speedPills.forEach(pill => {
  pill.addEventListener('click', () => {
    setSpeed(parseFloat(pill.dataset.speed || '1'))
  })
})

// ─── File upload ───

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    yamlInput.value = reader.result as string
    fileInput.value = ''
  }
  reader.readAsText(file)
})

// ─── Warnings display ───

function showWarnings(warnings: { message: string }[]) {
  warningsEl.innerHTML = warnings
    .map(w => `<div class="warn-item">${w.message}</div>`)
    .join('')
}

function showError(msg: string) {
  warningsEl.innerHTML = `<div class="error-item">${msg}</div>`
}

function clearWarnings() {
  warningsEl.innerHTML = ''
}

// ─── Animate ───

function doAnimate() {
  const yaml = yamlInput.value.trim()
  if (!yaml) {
    showError('Paste a Concourse pipeline YAML to visualize')
    return
  }

  // Kill previous animation
  if (currentTl) {
    currentTl.kill()
    currentTl = null
  }
  gsap.killTweensOf(vizOutput.querySelectorAll('*'))
  clearWarnings()

  // Parse
  let result
  try {
    result = parseConcourseYAML(yaml)
  } catch (e) {
    showError((e as Error).message)
    vizOutput.innerHTML = ''
    return
  }

  if (result.warnings.length > 0) {
    showWarnings(result.warnings)
  }

  // Render
  const comp = createPipelineComponent(vizOutput)
  comp.render(result.pipeline)

  // Animate after render settles
  vizOutput.addEventListener('pv:ready', () => {
    currentTl = buildTimeline(vizOutput, comp, result.pipeline.jobs, {
      speed: currentSpeed,
      onDone: () => {},
      onReplay: () => {
        comp.resetStates()
        if (currentTl) {
          currentTl.seek(0)
          currentTl.play()
        }
      },
    })
    currentTl.timeScale(1 / currentSpeed)
    currentTl.play()
  }, { once: true })
}

btnAnimate.addEventListener('click', doAnimate)

// Ctrl/Cmd + Enter to animate
yamlInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    doAnimate()
  }
})

// ─── Replay ───

btnReplay.addEventListener('click', () => {
  if (!currentTl) return
  // Reset all states by re-running
  doAnimate()
})

// ─── Sample pipeline (pre-loaded) ───

const SAMPLE_YAML = `resources:
- name: repo
  type: git
  source:
    uri: https://github.com/example/app

- name: docker-img
  type: registry-image
  source:
    repository: example/app

jobs:
- name: unit-test
  plan:
  - get: repo
    trigger: true
  - task: run-tests
    file: repo/ci/test.yml

- name: build
  plan:
  - get: repo
    passed: [unit-test]
    trigger: true
  - task: compile
    file: repo/ci/build.yml
  - put: docker-img
    params:
      build: .

- name: integration-test
  plan:
  - get: repo
    passed: [unit-test]
    trigger: true
  - get: docker-img
    passed: [build]
  - task: run-integration
    file: repo/ci/integration.yml

- name: deploy-staging
  plan:
  - get: repo
    passed: [build, integration-test]
  - task: deploy
    file: repo/ci/deploy.yml
    params:
      ENV: staging
`

yamlInput.value = SAMPLE_YAML
