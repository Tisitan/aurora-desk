const { net } = require('electron')

const TIMEOUT_MS = 10000
const state = []
// 轮询定时器句柄集中登记：restart 必须先 clearInterval 再重建，
// 否则设置面板每改一次端点就多出一批无人认领的定时器（泄漏 + 重复请求）
let timers = []
// 世代号：在途请求回包时比对，端点被改/删后旧回包不再污染新 state，也不再推陈旧卡片
let generation = 0
// 模块可见性联动：apicards 卡隐藏时轮询整体暂停（clearInterval），恢复可见再重建
let moduleVisible = true
let lastCards = []
let lastOnSample = null

async function fetchJson(url) {
  const res = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

function pick(obj, dotPath) {
  return String(dotPath || '')
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^api\./, '')
  } catch {
    return ''
  }
}

function fmtVal(v) {
  if (typeof v === 'number') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v === undefined || v === null) return '--'
  return String(v)
}

function exportList() {
  return state.map((s) => ({
    name: s.cfg.name,
    host: hostOf(s.cfg.url),
    unit: s.cfg.unit || '',
    intervalSec: s.cfg.intervalSec || 30,
    valueText: fmtVal(s.value),
    dir: s.dir,
    updatedAt: s.updatedAt,
    stale: s.stale,
  }))
}

async function tick(i, onSample, gen) {
  const s = state[i]
  if (!s) return
  try {
    const j = await fetchJson(s.cfg.url)
    if (gen !== generation) return
    const v = pick(j, s.cfg.jsonPath)
    if (v === undefined) throw new Error('path miss: ' + s.cfg.jsonPath)
    if (typeof v === 'number' && typeof s.value === 'number') {
      if (v > s.value) s.dir = 'up'
      else if (v < s.value) s.dir = 'down'
    }
    s.value = v
    s.updatedAt = Date.now()
    s.stale = false
    console.log('[aurora-desk] api', s.cfg.name, fmtVal(v))
  } catch (err) {
    if (gen !== generation) return
    s.stale = true
    console.log('[aurora-desk] api', s.cfg.name, 'failed:', err.message)
  }
  onSample(exportList())
}

function restart(cards, onSample) {
  generation++
  timers.forEach(clearInterval)
  timers = []
  state.length = 0
  const gen = generation
  ;(Array.isArray(cards) ? cards : []).forEach((cfg, i) => {
    state.push({ cfg, value: undefined, dir: null, updatedAt: null, stale: true })
    const iv = Math.max(5, Number(cfg.intervalSec) || 30) * 1000
    timers.push(setInterval(() => tick(i, onSample, gen), iv))
    tick(i, onSample, gen)
  })
  // 端点清空时也要推一次空列表，渲染层据此收起整块区域
  if (!state.length) onSample([])
}

function start(cards, onSample) {
  lastCards = Array.isArray(cards) ? cards : []
  lastOnSample = onSample
  if (!moduleVisible) return
  restart(lastCards, lastOnSample)
}

function setVisible(on) {
  const next = !!on
  if (next === moduleVisible) return
  moduleVisible = next
  if (!next) {
    generation++
    timers.forEach(clearInterval)
    timers = []
    return
  }
  if (lastOnSample) restart(lastCards, lastOnSample)
}

function latest() {
  return exportList()
}

module.exports = { start, restart, latest, setVisible }
