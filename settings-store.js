const fs = require('node:fs')
const path = require('node:path')

// 测试取证可用 DESK_WIDGET_CONFIG 指向独立配置，避免污染线上 config.json（含 key）
const FILE = process.env.DESK_WIDGET_CONFIG || path.join(__dirname, 'config.json')

// 注意：和风 key 只落 config.json，源码里一律留空（设置面板可填）
const DEFAULT_CONFIG = {
  weather: {
    provider: 'qweather',
    key: '',
    apiHost: 'https://devapi.qweather.com',
    geoHost: 'https://geoapi.qweather.com',
    city: '上海',
  },
  customApis: [],
  appearance: { accent: 'cyanPurple', cardAlpha: 0.72 },
  monitor: { intervalSec: 2 },
  window: { layerMode: 'below' },
  layout: { modules: [] },
  clickthrough: false,
}

let cache = null

function mergeSection(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ...base }
  return { ...base, ...patch }
}

function normalizeWeather(raw) {
  const w = mergeSection(DEFAULT_CONFIG.weather, raw)
  const host = (v, d) => {
    const s = String(v || '').trim().replace(/\/+$/, '')
    return /^https?:\/\//.test(s) ? s : d
  }
  return {
    provider: w.provider === 'open-meteo' ? 'open-meteo' : 'qweather',
    key: String(w.key || '').trim(),
    apiHost: host(w.apiHost, DEFAULT_CONFIG.weather.apiHost),
    geoHost: host(w.geoHost, DEFAULT_CONFIG.weather.geoHost),
    city: String(w.city || DEFAULT_CONFIG.weather.city).trim() || DEFAULT_CONFIG.weather.city,
  }
}

// layout.modules 只做形状消毒（去重/去脏/补 order），id 合法性与缺省补全由渲染层注册表裁决
function normalizeLayout(raw) {
  const list = raw && Array.isArray(raw.modules)
    ? raw.modules
    : Array.isArray(raw)
      ? raw
      : []
  const modules = []
  const seen = new Set()
  for (const m of list) {
    const id = m && typeof m.id === 'string' ? m.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    modules.push({ id, visible: m.visible !== false, order: modules.length })
  }
  return { modules }
}

function normalize(raw) {
  const rawObj = raw && typeof raw === 'object' ? raw : {}
  return {
    weather: normalizeWeather(rawObj.weather),
    customApis:
      Array.isArray(rawObj.customApis)
        ? rawObj.customApis.map((a) => ({
            name: String(a.name || '未命名').trim() || '未命名',
            url: String(a.url || '').trim(),
            jsonPath: String(a.jsonPath || '').trim(),
            unit: String(a.unit ?? '').trim(),
            intervalSec: Math.min(Math.max(Number(a.intervalSec) || 30, 5), 3600),
          }))
        : [],
    appearance: mergeSection(DEFAULT_CONFIG.appearance, rawObj.appearance),
    window: { layerMode: rawObj.window && rawObj.window.layerMode === 'top' ? 'top' : 'below' },
    monitor: {
      intervalSec: Math.min(Math.max(Number(rawObj.monitor && rawObj.monitor.intervalSec) || 2, 1), 60),
    },
    layout: normalizeLayout(rawObj.layout),
    clickthrough: !!rawObj.clickthrough,
  }
}

function persist(cfg) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2))
  } catch (err) {
    console.error('[aurora-desk] config save failed:', err.message)
  }
}

function get() {
  if (cache) return cache
  try {
    cache = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')))
  } catch {
    cache = normalize(null)
    persist(cache)
  }
  return cache
}

function set(patch) {
  const cur = get()
  const p = patch && typeof patch === 'object' ? patch : {}
  const wPatch = p.weather && typeof p.weather === 'object' ? { ...p.weather } : null
  // 面板的密钥框默认留空（也不回传打码值）：这两种情况都表示「不改密钥」，
  // 否则用户只改个城市就会把 config.json 里的 key 抹成空串
  if (wPatch && (!wPatch.key || /\*{3}$/.test(String(wPatch.key)))) delete wPatch.key
  const next = {
    ...cur,
    weather: wPatch ? normalizeWeather({ ...cur.weather, ...wPatch }) : cur.weather,
    customApis: Array.isArray(p.customApis) ? normalize({ customApis: p.customApis }).customApis : cur.customApis,
    appearance: p.appearance ? mergeSection(cur.appearance, p.appearance) : cur.appearance,
    monitor: p.monitor ? mergeSection(cur.monitor, p.monitor) : cur.monitor,
    window: p.window ? { layerMode: p.window.layerMode === 'top' ? 'top' : 'below' } : cur.window,
    layout: p.layout ? normalizeLayout(p.layout) : cur.layout,
    clickthrough: p.clickthrough !== undefined ? !!p.clickthrough : cur.clickthrough,
  }
  cache = next
  persist(next)
  return next
}

// 渲染层/IPC 出口一律打码：密钥不进 DOM，截图取证也不会漏 key
function redact(cfg) {
  const key = cfg.weather.key
  return {
    ...cfg,
    weather: {
      ...cfg.weather,
      key: key ? key.slice(0, 4) + '***' : '',
      keySet: !!key,
    },
  }
}

function register(ipcMain, hooks) {
  ipcMain.handle('settings:get', () => redact(get()))
  ipcMain.handle('settings:set', (_e, patch) => {
    const cfg = set(patch || {})
    if (patch && patch.monitor) hooks.onMonitor(cfg.monitor.intervalSec)
    if (patch && patch.weather) hooks.onWeather(cfg.weather)
    if (patch && patch.customApis) hooks.onApis(cfg.customApis)
    if (patch && patch.appearance) hooks.onAppearance(cfg.appearance)
    if (patch && patch.window) hooks.onLayer(cfg.window.layerMode)
    if (patch && patch.layout && hooks.onLayout) hooks.onLayout(cfg.layout)
    if (patch && patch.clickthrough !== undefined) hooks.onClickthrough(cfg.clickthrough)
    return redact(cfg)
  })
  ipcMain.handle('clickthrough:set', (_e, on) => {
    const cfg = set({ clickthrough: !!on })
    hooks.onClickthrough(cfg.clickthrough)
    return cfg.clickthrough
  })
  ipcMain.handle('clickthrough:get', () => get().clickthrough)
}

module.exports = { get, set, register, redact, DEFAULT_CONFIG }
