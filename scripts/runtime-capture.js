// 离屏渲染取证：把真实渲染管线（主进程数据 + 卡片 DOM）拍成 runtime.png
// 用法：electron runtime-capture.js [full|drawer]
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const collector = require('../collector')
const weatherSvc = require('../weather')
const apiCardsSvc = require('../api-cards')
const todosStore = require('../todos-store')
const settings = require('../settings-store')
const autostart = require('../autostart')

const mode = process.argv[2] || 'full'
const OUT = path.join(__dirname, '..', mode === 'drawer' ? 'runtime-settings.png' : 'runtime.png')

app.commandLine.appendSwitch('force-device-scale-factor', '2')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 320,
    height: 1200,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  })

  ipcMain.handle('stats:get', () => collector.latestSample())
  ipcMain.handle('layout:content', () => undefined)
  collector.startInterval(2000, (sample) => {
    if (!win.isDestroyed()) win.webContents.send('stats', sample)
  })
  const push = (channel, data) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
  todosStore.register(ipcMain)
  const cfg = settings.get()
  weatherSvc.start(cfg.weather, (s) => push('weather', s))
  ipcMain.handle('weather:get', () => weatherSvc.latest())
  apiCardsSvc.start(cfg.customApis, (list) => push('api-cards', list))
  ipcMain.handle('api:get', () => apiCardsSvc.latest())
  settings.register(ipcMain, {
    onMonitor: () => { },
    onWeather: (w) => weatherSvc.start(w, (s) => push('weather', s)),
    onApis: (list) => apiCardsSvc.start(list, (l) => push('api-cards', l)),
    onAppearance: (a) => push('appearance', a),
    onClickthrough: () => { },
  })
  // 取证窗只读真实自启动状态，绝不改动用户已有的 autostart
  ipcMain.handle('autostart:get', () => autostart.isOn())
  ipcMain.handle('autostart:set', () => autostart.isOn())
  ipcMain.handle('app:quit', () => { })

  await win.loadFile(path.join(__dirname, '..', 'index.html'))
  // 取证门槛：监控至少 10 帧、天气至少 1 次；数据源卡只在配置了端点时才要求
  await win.webContents.executeJavaScript(
    `new Promise((resolve) => {
      const needApi = ${cfg.customApis.length > 0 ? 'true' : 'false'}
      const ok = () => (window.__statsCount || 0) >= 10 && (window.__weatherCount || 0) >= 1 &&
        (!needApi || (window.__apiCount || 0) >= 1)
      if (ok()) return resolve('ok')
      let waited = 0
      const t = setInterval(() => {
        if (ok()) { clearInterval(t); resolve('ok') }
        else if ((waited += 250) > 20000) { clearInterval(t); resolve('timeout:' + JSON.stringify({ s: window.__statsCount, w: window.__weatherCount, a: window.__apiCount })) }
      }, 250)
    })`
  ).then((r) => console.log('[runtime-capture] gate:', r))

  if (mode === 'drawer') {
    await win.webContents.executeJavaScript(`document.getElementById('btn-settings').click()`)
    await new Promise((r) => setTimeout(r, 500))
  }

  await win.webContents.insertCSS(
    'html, body { height: auto !important; overflow: visible !important; background: radial-gradient(90% 55% at 12% 0%, rgba(34,211,238,0.10), transparent 60%),' +
    ' radial-gradient(85% 60% at 100% 100%, rgba(167,139,250,0.12), transparent 62%),' +
    ' radial-gradient(120% 90% at 25% 30%, #1c2130 0%, #12141d 52%, #0a0c12 100%) !important; }' +
    (mode === 'drawer' ? '.drawer { opacity: 1 !important; pointer-events: auto !important; } .drawer-inner { transform: none !important; }' : '')
  )

  const m = await win.webContents.executeJavaScript(
    '(() => { const apiEl = document.getElementById("api-cards"); return { docSH: document.documentElement.scrollHeight, colH: Math.ceil(document.querySelector(".column").getBoundingClientRect().height), apiCards: document.querySelectorAll(".api-card").length, apiHidden: apiEl ? getComputedStyle(apiEl).display : "no-module", air: (document.getElementById("weather-air")||{}).textContent } })()'
  )
  console.log('[runtime-capture] metrics:', JSON.stringify(m))
  win.setContentSize(320, Math.max(m.colH, 240))
  await new Promise((r) => setTimeout(r, 400))

  const img = await win.webContents.capturePage()
  fs.writeFileSync(OUT, img.toPNG())
  console.log('[runtime-capture] saved:', OUT, 'size:', JSON.stringify(img.getSize()))
  app.quit()
})
