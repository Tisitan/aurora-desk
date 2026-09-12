const { app, BrowserWindow, screen, ipcMain, globalShortcut, powerMonitor } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const v8 = require('node:v8')
const collector = require('./collector')
const weatherSvc = require('./weather')
const apiCardsSvc = require('./api-cards')
const todosStore = require('./todos-store')
const settings = require('./settings-store')
const autostart = require('./autostart')
const layerMode = require('./layer-mode')

const WIDGET_W = 320
const MIN_H = 240
const EDGE_GAP = 8
// 锁屏/挂起时 nobody 在看，采集降频到 10s；解锁即恢复配置值
const LOCKED_STATS_MS = 10000
const BOUNDS_FILE = path.join(__dirname, 'window-bounds.json')
const CLICKTHROUGH_HOTKEY = 'CommandOrControl+Alt+W'

// 关掉原生遮挡计算，防透明窗被判定遮挡后掐停渲染出帧
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
// 常驻件内存红线：渲染进程 V8 老生代上限 128MB（实测 3586MB → 228MB）。
// 主进程侧 appendSwitch 生效太晚，实测只有 CLI 的 --js-flags 能压住（4192MB → 224MB），
// 故由 start.sh / npm start 以命令行参数带上；NODE_OPTIONS 与 --node-options 在 Electron 下均无效。
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')
// A/B 取证用：WIDGET_SOFT=1 走软渲染，对比 RSS 与透明/毛玻璃观感后再决定默认值
if (process.env.WIDGET_SOFT === '1') app.disableHardwareAcceleration()

// 24/7 常驻 + 自启动：重复拉起的第二个实例必须退出，否则进程树 RSS 直接翻倍
if (!app.requestSingleInstanceLock()) app.quit()

let win = null
let statsTimer = null
let heapTimer = null
let locked = false
let contentH = 0
// 高度握手只在结果变化时打日志：ResizeObserver 高频回调下按 tick 刷屏没意义
let lastFit = 0
let lastScrolled = false

function logHeap(tag) {
  const h = v8.getHeapStatistics()
  console.log(`[aurora-desk] ${tag} heapTotal=${(h.total_heap_size / 1048576).toFixed(1)}MB used=${(h.used_heap_size / 1048576).toFixed(1)}MB cap=${(h.heap_size_limit / 1048576).toFixed(0)}MB`)
}

function loadBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'))
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw
  } catch { }
  return null
}

function saveBounds(bounds) {
  try {
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }))
  } catch (error) {
    console.error('[aurora-desk] bounds save failed:', error)
  }
}

// 出屏钳位：窗口始终留在最近显示器工作区内（高度方向留 EDGE_GAP，标题拖拽条不被顶出屏）
function clampBounds(b) {
  const wa = screen.getDisplayMatching(b).workArea
  const maxX = wa.x + Math.max(0, wa.width - b.width)
  const maxY = wa.y + Math.max(0, wa.height - b.height)
  return {
    ...b,
    x: Math.min(Math.max(b.x, wa.x), maxX),
    y: Math.min(Math.max(b.y, wa.y), maxY),
  }
}

function baseStatsMs() {
  const sec = Number(settings.get().monitor.intervalSec)
  return Math.min(Math.max(sec || 2, 1), 60) * 1000
}

// 模块在 config.layout.modules 里缺席 = 可见（缺省全显）
function moduleVisible(layout, id) {
  const m = layout && Array.isArray(layout.modules) ? layout.modules.find((x) => x.id === id) : null
  return m ? m.visible !== false : true
}

function statsMs() {
  return locked ? Math.max(baseStatsMs(), LOCKED_STATS_MS) : baseStatsMs()
}

function restartStats() {
  if (statsTimer) clearInterval(statsTimer)
  statsTimer = collector.startInterval(statsMs(), (sample) => push('stats', sample))
}

function push(channel, data) {
  if (win !== null && !win.isDestroyed()) win.webContents.send(channel, data)
}

function applyClickthrough(on) {
  if (win === null || win.isDestroyed()) return
  // Linux 下 forward 不生效：穿透即整窗不收输入，恢复入口交给全局热键 Ctrl+Alt+W
  win.setIgnoreMouseEvents(!!on)
  console.log('[aurora-desk] clickthrough:', on ? 'on' : 'off')
}

function fitHeight(h) {
  if (win === null || win.isDestroyed()) return
  contentH = Math.max(MIN_H, Math.ceil(Number(h) || MIN_H))
  const cur = win.getBounds()
  const wa = screen.getDisplayMatching(cur).workArea
  const maxH = Math.max(MIN_H, wa.height - EDGE_GAP)
  const target = Math.min(contentH, maxH)
  const scrolled = contentH > target
  if (target !== lastFit || scrolled !== lastScrolled) {
    lastFit = target
    lastScrolled = scrolled
    console.log('[aurora-desk] fit height win=' + target + ' content=' + contentH + ' workArea=' + wa.height + (scrolled ? ' → body 内滚' : ''))
  }
  const next = clampBounds({ ...cur, height: target })
  if (next.height !== cur.height || next.x !== cur.x || next.y !== cur.y) win.setBounds(next)
  push('layout', { scrolled, winH: target, contentH })
}

app.whenReady().then(() => {
  logHeap('boot')
  const cfg = settings.get()
  // 常驻件泄漏哨兵：每 60s 一条堆水位，长跑几天也能事后对账
  heapTimer = setInterval(() => logHeap('watch'), 60000)
  const wa = screen.getPrimaryDisplay().workArea
  const saved = loadBounds()
  const savedH = saved && Number.isFinite(saved.height) ? Math.min(saved.height, wa.height - EDGE_GAP) : MIN_H
  const initial = clampBounds({
    width: WIDGET_W,
    height: Math.max(MIN_H, savedH),
    x: saved ? saved.x : wa.x + wa.width - WIDGET_W - 24,
    y: saved ? saved.y : wa.y + 48,
  })
  console.log('[aurora-desk] bounds:', saved ? 'restored+clamped' : 'default top-right', JSON.stringify(initial))

  win = new BrowserWindow({
    ...initial,
    frame: false,
    transparent: true,
    // 层级由 window.layerMode 决定：below=桌面级（普通窗口盖住它），top=screen-saver 置顶
    alwaysOnTop: cfg.window.layerMode === 'top',
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  })
  // 窗口被 WM 接管后再施加层级（ready-to-show 时 XID 已可用且已完成 reparent）
  win.once('ready-to-show', () => layerMode.apply(win, cfg.window.layerMode))

  // 系统监控采集：配置间隔 + 锁屏降频
  restartStats()
  ipcMain.handle('stats:get', () => collector.latestSample())
  ipcMain.handle('layout:content', (_e, h) => fitHeight(h))

  weatherSvc.start(cfg.weather, (s) => push('weather', s))
  ipcMain.handle('weather:get', () => weatherSvc.latest())
  // 数据源卡按配置初始化可见性：隐藏时 start 直接走暂停路径，不发首轮请求
  apiCardsSvc.setVisible(moduleVisible(cfg.layout, 'apicards'))
  apiCardsSvc.start(cfg.customApis, (list) => push('api-cards', list))
  ipcMain.handle('api:get', () => apiCardsSvc.latest())
  todosStore.register(ipcMain)

  settings.register(ipcMain, {
    onMonitor: () => restartStats(),
    onWeather: (patch) => weatherSvc.start(patch, (s) => push('weather', s)),
    onApis: (list) => apiCardsSvc.start(list, (l) => push('api-cards', l)),
    onAppearance: (a) => push('appearance', a),
    onLayer: (mode) => layerMode.apply(win, mode),
    onLayout: (layout) => apiCardsSvc.setVisible(moduleVisible(layout, 'apicards')),
    onClickthrough: applyClickthrough,
  })
  ipcMain.handle('autostart:get', () => autostart.isOn())
  ipcMain.handle('autostart:set', (_e, on) => autostart.apply(!!on))
  ipcMain.handle('app:quit', () => app.quit())

  // minimize 小黑屋防护：Linux WM 偶发把 skipTaskbar 窗最小化且无入口找回
  win.on('minimize', () => {
    console.error('[aurora-desk] minimized by WM, restoring')
    if (win !== null && !win.isDestroyed()) win.restore()
  })

  // 位置记忆：move 防抖 500ms 写盘，写前先钳位（拖出屏外时以屏内为准落盘，不留非法坐标）
  let saveTimer = null
  win.on('move', () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win === null || win.isDestroyed()) return
      const fixed = clampBounds(win.getBounds())
      if (fixed.x !== win.getBounds().x || fixed.y !== win.getBounds().y) win.setBounds(fixed)
      saveBounds(fixed)
    }, 500)
  })

  // muffin 实测行为：点击 BELOW 窗可能被 raise 到 normal 层并清掉 _NET_WM_STATE_BELOW，
  // 获焦后 300ms 重新施加一次（防抖，避免连续点击时反复写状态原子）
  let layerTimer = null
  win.on('focus', () => {
    if (settings.get().window.layerMode !== 'below') return
    clearTimeout(layerTimer)
    layerTimer = setTimeout(() => {
      if (win !== null && !win.isDestroyed()) layerMode.apply(win, 'below')
    }, 300)
  })

  powerMonitor.on('lock-screen', () => {
    locked = true
    restartStats()
    console.log('[aurora-desk] lock-screen -> stats', statsMs() / 1000 + 's')
  })
  powerMonitor.on('unlock-screen', () => {
    locked = false
    restartStats()
    console.log('[aurora-desk] unlock-screen -> stats', statsMs() / 1000 + 's')
  })
  powerMonitor.on('suspend', () => {
    locked = true
    restartStats()
  })
  powerMonitor.on('resume', () => {
    locked = false
    restartStats()
    if (win !== null && !win.isDestroyed()) layerMode.apply(win, settings.get().window.layerMode)
  })

  const hotkeyOk = globalShortcut.register(CLICKTHROUGH_HOTKEY, () => {
    const next = !settings.get().clickthrough
    settings.set({ clickthrough: next })
    applyClickthrough(next)
    push('clickthrough', next)
  })
  console.log('[aurora-desk] hotkey', CLICKTHROUGH_HOTKEY, hotkeyOk ? 'registered' : 'FAILED (taken by WM)')

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
      else win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  applyClickthrough(cfg.clickthrough)
  win.loadFile('index.html')
  win.on('closed', () => { win = null })
  logHeap('ready')
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (statsTimer) clearInterval(statsTimer)
  if (heapTimer) clearInterval(heapTimer)
  logHeap('quit')
})
