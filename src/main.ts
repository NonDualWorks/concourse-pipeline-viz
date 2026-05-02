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
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement

// ─── State ───

let currentTl: gsap.core.Timeline | null = null
let currentSpeed = 1

// ─── Speed control ───

function setSpeed(val: number) {
  currentSpeed = val
  speedSlider.value = String(val)
  speedVal.textContent = `${val.toFixed(1)}x`
  if (currentTl) currentTl.timeScale(1 / val)

  speedPills.forEach(p => {
    p.classList.toggle('on', parseFloat(p.dataset.speed || '1') === val)
  })
}

speedSlider.addEventListener('input', () => setSpeed(parseFloat(speedSlider.value)))
speedPills.forEach(pill => {
  pill.addEventListener('click', () => setSpeed(parseFloat(pill.dataset.speed || '1')))
})

// ─── File upload ───

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    yamlInput.value = reader.result as string
    fileInput.value = ''
    sampleSelect.value = 'custom'
  }
  reader.readAsText(file)
})

// ─── Warnings display ───

function showWarnings(warnings: { message: string }[]) {
  warningsEl.innerHTML = warnings.map(w => `<div class="warn-item">${w.message}</div>`).join('')
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

  if (currentTl) { currentTl.kill(); currentTl = null }
  gsap.killTweensOf(vizOutput.querySelectorAll('*'))
  clearWarnings()

  let result
  try {
    result = parseConcourseYAML(yaml)
  } catch (e) {
    showError((e as Error).message)
    vizOutput.innerHTML = ''
    return
  }

  if (result.warnings.length > 0) showWarnings(result.warnings)

  const comp = createPipelineComponent(vizOutput)
  comp.render(result.pipeline)

  vizOutput.addEventListener('pv:ready', () => {
    currentTl = buildTimeline(vizOutput, comp, result.pipeline.jobs, {
      speed: currentSpeed,
      onDone: () => {},
      onReplay: () => {
        comp.resetStates()
        if (currentTl) { currentTl.seek(0); currentTl.play() }
      },
    })
    currentTl.timeScale(1 / currentSpeed)
    currentTl.play()
  }, { once: true })
}

btnAnimate.addEventListener('click', doAnimate)
yamlInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doAnimate() }
})
btnReplay.addEventListener('click', () => { if (currentTl) doAnimate() })

// ─── Sample pipelines ───

const SAMPLES: Record<string, string> = {
simple: `resources:
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

- name: deploy-staging
  plan:
  - get: repo
    passed: [build]
  - task: deploy
    file: repo/ci/deploy.yml
    params:
      ENV: staging`,

parallel: `resources:
- name: repo
  type: git
  source: { uri: https://github.com/example/app }
- name: docker-img
  type: registry-image
  source: { repository: example/app }
- name: npm-cache
  type: s3
  source: { bucket: ci-cache }

jobs:
- name: unit-test
  plan:
  - get: repo
    trigger: true
  - task: run-unit-tests
    file: repo/ci/unit.yml

- name: lint
  plan:
  - get: repo
    trigger: true
  - task: run-linter
    file: repo/ci/lint.yml

- name: security-scan
  plan:
  - get: repo
    trigger: true
  - task: scan-deps
    file: repo/ci/security.yml

- name: build
  plan:
  - get: repo
    passed: [unit-test, lint, security-scan]
    trigger: true
  - task: compile
    file: repo/ci/build.yml
  - put: docker-img
    params: { build: . }

- name: integration-test
  plan:
  - get: repo
    passed: [build]
  - get: docker-img
    passed: [build]
  - task: run-integration
    file: repo/ci/integration.yml

- name: deploy-staging
  plan:
  - get: repo
    passed: [integration-test]
  - task: deploy
    file: repo/ci/deploy-staging.yml`,

hooks: `resources:
- name: repo
  type: git
  source: { uri: https://github.com/example/app }
- name: docker-img
  type: registry-image
  source: { repository: example/app }
- name: slack
  type: slack-notification
  source: { url: https://hooks.slack.com/xxx }
- name: version
  type: semver
  source: { driver: git, uri: https://github.com/example/version }

jobs:
- name: test
  plan:
  - get: repo
    trigger: true
  - task: run-tests
    file: repo/ci/test.yml
    on_failure:
      put: slack
      params: { text: "Tests failed!" }
  ensure:
    put: slack
    params: { text: "Test job finished" }

- name: build
  plan:
  - get: repo
    passed: [test]
    trigger: true
  - get: version
    params: { bump: minor }
  - do:
    - task: compile
      file: repo/ci/build.yml
    - task: package
      file: repo/ci/package.yml
  - put: docker-img
    params: { build: . }
    on_success:
      put: version
      params: { file: version/version }
    on_failure:
      put: slack
      params: { text: "Build failed!" }

- name: deploy
  plan:
  - get: repo
    passed: [build]
  - get: docker-img
    passed: [build]
  - task: deploy-to-staging
    file: repo/ci/deploy.yml
  on_failure:
    put: slack
    params: { text: "Deploy failed!" }
  ensure:
    task: cleanup
    file: repo/ci/cleanup.yml`,

complex: `resources:
- name: repo
  type: git
  source: { uri: https://github.com/example/app }
- name: docker-img
  type: registry-image
  source: { repository: example/app }
- name: slack
  type: slack-notification
  source: { url: https://hooks.slack.com/xxx }
- name: version
  type: semver
  source: { driver: git, uri: https://github.com/example/version }
- name: artifacts
  type: s3
  source: { bucket: ci-artifacts }

groups:
- name: build
  jobs: [unit-test, lint, compile, package]
- name: deploy
  jobs: [deploy-staging, smoke-test, deploy-prod]

jobs:
- name: unit-test
  plan:
  - get: repo
    trigger: true
  - in_parallel:
    - task: test-api
      file: repo/ci/test-api.yml
    - task: test-web
      file: repo/ci/test-web.yml
    - task: test-worker
      file: repo/ci/test-worker.yml
  on_failure:
    put: slack
    params: { text: "Unit tests failed" }

- name: lint
  plan:
  - get: repo
    trigger: true
  - in_parallel:
    - task: eslint
      file: repo/ci/eslint.yml
    - task: typecheck
      file: repo/ci/typecheck.yml

- name: compile
  plan:
  - get: repo
    passed: [unit-test, lint]
    trigger: true
  - get: version
    params: { bump: patch }
  - task: build-all
    file: repo/ci/build.yml
  - in_parallel:
    - put: docker-img
      params: { build: . }
    - put: artifacts
      params: { file: build/app.tar.gz }
  - put: version
    params: { file: version/version }

- name: package
  plan:
  - get: repo
    passed: [compile]
  - get: docker-img
    passed: [compile]
  - task: helm-package
    file: repo/ci/helm-package.yml
  - put: artifacts
    params: { file: charts/app.tgz }

- name: deploy-staging
  plan:
  - get: repo
    passed: [package]
  - get: artifacts
    passed: [package]
  - task: helm-deploy
    file: repo/ci/deploy.yml
    params: { ENV: staging }
  on_failure:
    put: slack
    params: { text: "Staging deploy failed" }

- name: smoke-test
  plan:
  - get: repo
    passed: [deploy-staging]
  - task: run-smoke
    file: repo/ci/smoke.yml
  on_failure:
    do:
    - put: slack
      params: { text: "Smoke tests failed" }
    - task: rollback
      file: repo/ci/rollback.yml

- name: deploy-prod
  plan:
  - get: repo
    passed: [smoke-test]
  - get: version
    passed: [compile]
  - task: helm-deploy
    file: repo/ci/deploy.yml
    params: { ENV: production }
  on_success:
    put: slack
    params: { text: "Production deploy succeeded!" }
  on_failure:
    do:
    - task: rollback-prod
      file: repo/ci/rollback.yml
    - put: slack
      params: { text: "PROD DEPLOY FAILED - rolled back" }`,
}

// ─── Sample selector ───

sampleSelect.addEventListener('change', () => {
  const key = sampleSelect.value
  if (SAMPLES[key]) {
    yamlInput.value = SAMPLES[key]
  }
})

// Load default sample
yamlInput.value = SAMPLES.simple
