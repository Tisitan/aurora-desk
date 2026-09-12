const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

let prevCpu = null
let prevNet = null
let latest = null
let cachedTempPath = null

function readCpuTimes() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n', 1)[0]
  if (!line.startsWith('cpu ')) return null
  const cols = line.trim().split(/\s+/).slice(1).map(Number)
  if (cols.length < 4) return null
  const idle = cols[3] + (cols[4] || 0)
  const total = cols.reduce((a, b) => a + b, 0)
  return { idle, total }
}

function readMem() {
  const info = {}
  for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/)
    if (m) info[m[1]] = Number(m[2])
  }
  if (!info.MemTotal || info.MemAvailable === undefined) return null
  const G = 1024 * 1024
  const usedK = info.MemTotal - info.MemAvailable
  return {
    usedGB: usedK / G,
    totalGB: info.MemTotal / G,
    pct: (usedK / info.MemTotal) * 100,
  }
}

function tryReadTemp(path) {
  try {
    const v = Number(fs.readFileSync(path, 'utf8').trim())
    if (Number.isFinite(v) && v > -40000 && v < 150000) return v / 1000
  } catch { }
  return null
}

function scanTempPath() {
  try {
    for (const z of fs.readdirSync('/sys/class/thermal')) {
      if (!z.startsWith('thermal_zone')) continue
      const base = `/sys/class/thermal/${z}`
      let type = ''
      try { type = fs.readFileSync(`${base}/type`, 'utf8').trim() } catch { }
      if (type === 'x86_pkg_temp') return `${base}/temp`
    }
  } catch { }
  try {
    for (const h of fs.readdirSync('/sys/class/hwmon')) {
      const base = `/sys/class/hwmon/${h}`
      let name = ''
      try { name = fs.readFileSync(`${base}/name`, 'utf8').trim() } catch { }
      if (name !== 'coretemp') continue
      for (const f of fs.readdirSync(base)) {
        if (!/^temp\d+_input$/.test(f)) continue
        let label = ''
        try { label = fs.readFileSync(`${base}/${f.replace('_input', '_label')}`, 'utf8').trim() } catch { }
        if (label === 'Package id 0') return `${base}/${f}`
      }
    }
  } catch { }
  return null
}

function findPkgInSensors(node) {
  if (Array.isArray(node)) {
    for (const it of node) {
      const r = findPkgInSensors(it)
      if (r != null) return r
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/^Package id 0/i.test(k)) {
        const arr = Array.isArray(v) ? v : [v]
        for (const it of arr) {
          if (it && typeof it === 'object' && Number.isFinite(it.temp1_input)) return it.temp1_input
        }
      } else {
        const r = findPkgInSensors(v)
        if (r != null) return r
      }
    }
  }
  return null
}

function readPkgTemp() {
  if (cachedTempPath) {
    const v = tryReadTemp(cachedTempPath)
    if (v != null) return v
    cachedTempPath = null
  }
  const p = scanTempPath()
  if (p) {
    const v = tryReadTemp(p)
    if (v != null) {
      cachedTempPath = p
      return v
    }
  }
  try {
    const v = findPkgInSensors(JSON.parse(execFileSync('sensors', ['-j'], { timeout: 1500 }).toString()))
    if (v != null) return v
  } catch { }
  return null
}

function readNetBytes() {
  let rx = 0
  let tx = 0
  for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const name = line.slice(0, idx).trim()
    if (name === 'lo') continue
    const cols = line.slice(idx + 1).trim().split(/\s+/).map(Number)
    if (cols.length < 9) continue
    rx += cols[0]
    tx += cols[8]
  }
  return { rx, tx }
}

function collect() {
  const ts = Date.now()
  const cpu = readCpuTimes()
  const net = readNetBytes()

  let cpuPct = null
  if (cpu && prevCpu) {
    const dTotal = cpu.total - prevCpu.total
    const dIdle = cpu.idle - prevCpu.idle
    if (dTotal > 0) cpuPct = Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100))
  }
  if (cpu) prevCpu = cpu

  let rxBps = null
  let txBps = null
  if (net && prevNet) {
    const dt = (ts - prevNet.ts) / 1000
    if (dt > 0 && net.rx >= prevNet.rx && net.tx >= prevNet.tx) {
      rxBps = (net.rx - prevNet.rx) / dt
      txBps = (net.tx - prevNet.tx) / dt
    }
  }
  if (net) prevNet = { ...net, ts }

  latest = { ts, cpuPct, mem: readMem(), pkgTemp: readPkgTemp(), rxBps, txBps }
  return latest
}

function latestSample() {
  return latest
}

// 常驻件日志不能按 tick 刷（2s 一轮 = 一天四万行）：每 logEvery 轮出一条紧凑摘要
let tickNo = 0

function startInterval(ms, onSample, logEvery) {
  const every = Math.max(1, Number(logEvery) || 15)
  tickNo = 0
  const first = collect()
  if (onSample) onSample(first)
  return setInterval(() => {
    const s = collect()
    if (++tickNo % every === 0) {
      console.log(
        '[aurora-desk] stats#' + tickNo,
        'cpu=' + (s.cpuPct == null ? '--' : s.cpuPct.toFixed(0) + '%'),
        'mem=' + (s.mem ? s.mem.pct.toFixed(0) + '%' : '--'),
        'temp=' + (s.pkgTemp == null ? '--' : s.pkgTemp.toFixed(0) + 'C'),
        'net=' + Math.round((s.rxBps || 0) / 1024) + 'kB/s'
      )
    }
    if (onSample) onSample(s)
  }, ms)
}

module.exports = { collect, latestSample, startInterval }
