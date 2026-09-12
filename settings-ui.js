// 设置抽屉 + 外观 + 高度自适应用手（渲染层）
const ACCENTS = {
  cyanPurple: ['#22d3ee', '#a78bfa'],
  aurora: ['#34d399', '#22d3ee'],
  sunset: ['#fbbf24', '#fb7185'],
  sakura: ['#f472b6', '#a78bfa'],
}

const ui = {
  drawer: document.getElementById('drawer'),
  btnSettings: document.getElementById('btn-settings'),
  btnClose: document.getElementById('drawer-close'),
  city: document.getElementById('set-city'),
  key: document.getElementById('set-key'),
  apiHost: document.getElementById('set-apihost'),
  geoHost: document.getElementById('set-geohost'),
  keyState: document.getElementById('set-keystate'),
  interval: document.getElementById('set-interval'),
  layer: document.getElementById('set-layer'),
  accent: document.getElementById('set-accent'),
  alpha: document.getElementById('set-alpha'),
  alphaVal: document.getElementById('set-alpha-val'),
  apiRows: document.getElementById('api-rows'),
  apiAdd: document.getElementById('api-add'),
  clickthrough: document.getElementById('set-clickthrough'),
  autostart: document.getElementById('set-autostart'),
  quit: document.getElementById('btn-quit'),
  modRows: document.getElementById('mod-rows'),
  column: document.querySelector('.column'),
}

let settings = null
let apis = []
let reportTimer = null

function applyAppearance(a) {
  const pair = ACCENTS[(a && a.accent) || 'cyanPurple'] || ACCENTS.cyanPurple
  const alpha = Math.min(Math.max(Number(a && a.cardAlpha) || 0.72, 0.3), 0.95)
  const r = document.documentElement.style
  r.setProperty('--accent-a', pair[0])
  r.setProperty('--accent-b', pair[1])
  r.setProperty('--card-bg', `rgba(18, 20, 28, ${alpha.toFixed(2)})`)
  r.setProperty('--card-shadow', `0 8px 24px rgba(0, 0, 0, ${(0.35 * (1 + alpha)).toFixed(2)})`)
}

// 高度握手：内容多高就报多高，主进程负责「装得下就长高、装不下就封顶并交给 body 内滚」
let lastReported = 0
function reportHeight() {
  const h = Math.ceil(ui.column.getBoundingClientRect().height)
  if (!h || Math.abs(h - lastReported) < 2) return
  lastReported = h
  window.deskUI.reportContent(h).catch(() => { })
}
new ResizeObserver(reportHeight).observe(ui.column)
window.addEventListener('resize', reportHeight)

function debounceReport() {
  clearTimeout(reportTimer)
  reportTimer = setTimeout(reportHeight, 120)
}

function setToggle(btn, on) {
  btn.classList.toggle('on', !!on)
  btn.setAttribute('aria-pressed', on ? 'true' : 'false')
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function rowHtml(a, i) {
  return `
  <div class="api-row-form" data-i="${i}">
    <div class="api-r1">
      <input class="inp sm" data-f="name" placeholder="名称（如 服务器负载）" value="${esc(a.name)}" maxlength="24" />
      <button class="icon-btn del" data-act="del" title="删除端点">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
      </button>
    </div>
    <input class="inp sm" data-f="url" placeholder="https://api.example.com/latest" value="${esc(a.url)}" spellcheck="false" />
    <div class="api-r2">
      <input class="inp sm mono" data-f="jsonPath" placeholder="取值路径 data.value" value="${esc(a.jsonPath)}" spellcheck="false" />
      <input class="inp sm" data-f="unit" placeholder="前缀" value="${esc(a.unit)}" maxlength="4" />
      <input class="inp sm mono num" data-f="intervalSec" type="number" min="5" max="3600" step="1" value="${esc(a.intervalSec)}" />
    </div>
  </div>`
}

function renderApiRows() {
  ui.apiRows.innerHTML = apis.length
    ? apis.map(rowHtml).join('')
    : '<div class="note">当前无端点，桌面不显示数据源卡。</div>'
}

function persist(nextApis) {
  apis = nextApis || apis
  renderApiRows()
  return window.deskUI.setSettings({ customApis: apis }).then(commit)
}

function commit(cfg) {
  if (!cfg) return
  settings = cfg
  if (window.ModuleHost) ModuleHost.syncFromConfig(cfg)
  syncDerived(cfg)
  renderModRows()
  debounceReport()
}

function syncDerived(cfg) {
  const w = cfg.weather
  ui.keyState.textContent = w.keySet
    ? `密钥已配置（${w.key}），留空即保持不变`
    : '未配置密钥：天气卡将显示不可用'
  ui.apiHost.placeholder = 'https://devapi.qweather.com'
  ui.geoHost.placeholder = 'https://geoapi.qweather.com'
  if (document.activeElement !== ui.city && w.city) ui.city.value = w.city
  if (document.activeElement !== ui.apiHost) ui.apiHost.value = w.apiHost || ''
  if (document.activeElement !== ui.geoHost) ui.geoHost.value = w.geoHost || ''
  ui.interval.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(cfg.monitor.intervalSec)))
  ui.layer.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.window.layerMode))
  ui.accent.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.appearance.accent))
  if (document.activeElement !== ui.alpha) ui.alpha.value = Math.round((cfg.appearance.cardAlpha ?? 0.72) * 100)
  ui.alphaVal.textContent = ui.alpha.value + '%'
  setToggle(ui.clickthrough, cfg.clickthrough)
  const monitorMeta = document.getElementById('monitor-meta')
  if (monitorMeta) monitorMeta.textContent = `本机 · ${cfg.monitor.intervalSec}s 刷新`
  document.body.classList.toggle('locked', !!cfg.clickthrough)
}

function saveWeather() {
  const patch = { city: ui.city.value.trim(), apiHost: ui.apiHost.value.trim(), geoHost: ui.geoHost.value.trim() }
  const k = ui.key.value.trim()
  if (k) patch.key = k
  return window.deskUI.setSettings({ weather: patch }).then((cfg) => {
    ui.key.value = ''
    commit(cfg)
  })
}

function buildAccentSwatches() {
  ui.accent.innerHTML = Object.entries(ACCENTS)
    .map(([k, v]) => `<button type="button" class="swatch" data-v="${k}" title="${k}" style="background:linear-gradient(135deg, ${v[0]}, ${v[1]})"></button>`)
    .join('')
}

const MV_UP_SVG = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 5l3-3 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const MV_DOWN_SVG = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 3l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function renderModRows() {
  if (!window.ModuleHost) return
  const list = ModuleHost.listModules()
  ui.modRows.innerHTML = list
    .map(
      (m, i) => `
    <div class="row-toggle mod-row" data-id="${esc(m.id)}">
      <span>${esc(m.name)}<em>${esc(m.id)}</em></span>
      <span class="mod-ops">
        <button class="icon-btn mv" data-act="up" title="上移" ${i === 0 ? 'disabled' : ''}>${MV_UP_SVG}</button>
        <button class="icon-btn mv" data-act="down" title="下移" ${i === list.length - 1 ? 'disabled' : ''}>${MV_DOWN_SVG}</button>
        <button class="sw" data-act="vis" aria-pressed="${m.visible}" title="${m.visible ? '隐藏模块' : '显示模块'}"></button>
      </span>
    </div>`
    )
    .join('')
  ui.modRows.querySelectorAll('.sw').forEach((b) => setToggle(b, b.getAttribute('aria-pressed') === 'true'))
}

function openDrawer(open) {
  ui.drawer.classList.toggle('open', open)
  document.body.classList.toggle('drawer-open', open)
  ui.drawer.setAttribute('aria-hidden', open ? 'false' : 'true')
  if (!open) ui.key.value = ''
  debounceReport()
}

ui.btnSettings.addEventListener('click', () => openDrawer(true))
ui.btnClose.addEventListener('click', () => openDrawer(false))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.drawer.classList.contains('open')) openDrawer(false)
})

ui.city.addEventListener('change', saveWeather)
ui.key.addEventListener('change', saveWeather)
ui.apiHost.addEventListener('change', saveWeather)
ui.geoHost.addEventListener('change', saveWeather)

ui.interval.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]')
  if (!b) return
  window.deskUI.setSettings({ monitor: { intervalSec: Number(b.dataset.v) } }).then(commit)
})

ui.layer.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]')
  if (!b) return
  window.deskUI.setSettings({ window: { layerMode: b.dataset.v } }).then(commit)
})

ui.accent.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]')
  if (!b) return
  const accent = b.dataset.v
  applyAppearance({ accent, cardAlpha: Number(ui.alpha.value) / 100 })
  window.deskUI.setSettings({ appearance: { accent } }).then(commit)
})

ui.alpha.addEventListener('input', () => {
  const a = Number(ui.alpha.value) / 100
  ui.alphaVal.textContent = ui.alpha.value + '%'
  applyAppearance({ accent: settings?.appearance?.accent, cardAlpha: a })
})
ui.alpha.addEventListener('change', () => {
  window.deskUI.setSettings({ appearance: { cardAlpha: Number(ui.alpha.value) / 100 } }).then(commit)
})

ui.apiAdd.addEventListener('click', () => {
  persist([...apis, { name: '未命名', url: '', jsonPath: '', unit: '', intervalSec: 30 }]).then(() => {
    const rows = ui.apiRows.querySelectorAll('.api-row-form')
    const last = rows[rows.length - 1]
    if (last) last.querySelector('input[data-f="name"]').focus()
  })
})

ui.apiRows.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act="del"]')
  if (!btn) return
  const i = Number(btn.closest('.api-row-form').dataset.i)
  persist(apis.filter((_, idx) => idx !== i))
})

// 端点表单：输入过程只落本地，change（失焦/回车）才写盘并重启轮询
ui.apiRows.addEventListener('input', (e) => {
  const input = e.target.closest('input[data-f]')
  if (!input) return
  const i = Number(input.closest('.api-row-form').dataset.i)
  const f = input.dataset.f
  if (!apis[i]) return
  apis[i] = { ...apis[i], [f]: f === 'intervalSec' ? Number(input.value) || 30 : input.value }
})

ui.apiRows.addEventListener('change', (e) => {
  if (!e.target.closest('input[data-f]')) return
  return window.deskUI.setSettings({ customApis: apis }).then(commit)
})

ui.modRows.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]')
  if (!btn || btn.disabled) return
  const row = btn.closest('.mod-row')
  if (!row) return
  const id = row.dataset.id
  if (btn.dataset.act === 'vis') ModuleHost.setVisible(id, !btn.classList.contains('on'))
  else if (btn.dataset.act === 'up') ModuleHost.move(id, -1)
  else if (btn.dataset.act === 'down') ModuleHost.move(id, 1)
  renderModRows()
  debounceReport()
})

ui.clickthrough.addEventListener('click', () => {
  const on = !settings.clickthrough
  if (on) openDrawer(false)
  window.deskUI.setSettings({ clickthrough: on }).then(commit)
})

ui.autostart.addEventListener('click', () => {
  const on = !ui.autostart.classList.contains('on')
  setToggle(ui.autostart, on)
  window.deskUI.setAutostart(on).then((real) => setToggle(ui.autostart, real))
})

ui.quit.addEventListener('click', () => window.deskUI.quit())

if (window.deskUI) {
  buildAccentSwatches()
  window.deskUI.onAppearance((a) => applyAppearance(a))
  window.deskUI.onClickthrough((on) => {
    setToggle(ui.clickthrough, on)
    document.body.classList.toggle('locked', !!on)
  })
  window.deskUI.onLayout((l) => {
    document.body.classList.toggle('scrollable', !!l.scrolled)
    debounceReport()
  })
  Promise.all([window.deskUI.getSettings(), window.deskUI.getAutostart()]).then(([cfg, auto]) => {
    if (window.ModuleHost) ModuleHost.init(cfg)
    commit(cfg)
    apis = (cfg.customApis || []).slice()
    renderApiRows()
    setToggle(ui.autostart, auto)
    ui.city.value = cfg.weather.city
    applyAppearance(cfg.appearance)
    reportHeight()
  })
}
