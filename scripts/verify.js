const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const collector = require('../collector')
const weatherSvc = require('../weather')
const apiCardsSvc = require('../api-cards')
const todosStore = require('../todos-store')

const mode = process.argv[2] || 'main'

app.commandLine.appendSwitch('force-device-scale-factor', '2')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 320,
    height: 1200,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  })

  ipcMain.handle('stats:get', () => collector.latestSample())
  collector.startInterval(2000, (s) => {
    if (!win.isDestroyed()) win.webContents.send('stats', s)
  })
  const push = (channel, data) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
  todosStore.register(ipcMain)
  weatherSvc.start({ city: process.env.WIDGET_CITY || '上海' }, (s) => push('weather', s))
  ipcMain.handle('weather:get', () => weatherSvc.latest())
  // 机制取证用端点：默认打本地桩（数值型，可看涨跌箭头）；也可用 WIDGET_API_URL 指真实源
  const stub = process.env.WIDGET_STUB || 'http://127.0.0.1:18080'
  const apiCfg = process.env.WIDGET_BAD_API
    ? [{ name: '坏源降级', url: 'http://127.0.0.1:9/x', jsonPath: 'a.b', unit: '', intervalSec: 5 }]
    : [
        { name: '负载桩', url: stub + '/v7/test/num', jsonPath: 'val', unit: '', intervalSec: 5 },
        { name: '坏源桩', url: 'http://127.0.0.1:9/x', jsonPath: 'a.b', unit: '', intervalSec: 5 },
      ]
  apiCardsSvc.start(apiCfg, (list) => push('api-cards', list))
  ipcMain.handle('api:get', () => apiCardsSvc.latest())

  await win.loadFile(path.join(__dirname, '..', 'index.html'))
  await new Promise((r) => setTimeout(r, 14000))

  const results = {}
  const probe = async (name, expr) => {
    results[name] = await win.webContents.executeJavaScript(expr)
  }

  if (mode === 'persist-check') {
    await new Promise((r) => setTimeout(r, 400))
    results.todoPersisted = await win.webContents.executeJavaScript(
      `document.getElementById('todo-list').textContent.includes('探针待办-持久化验证')`
    )
    results.todoChipAfterReload = await win.webContents.executeJavaScript(
      `document.getElementById('todo-chip').textContent`
    )
    await win.webContents.executeJavaScript(`document.querySelector('#todo-list .todo .dot').click()`)
    await new Promise((r) => setTimeout(r, 400))
    results.todoToggled = await win.webContents.executeJavaScript(
      `(() => {
        const li = document.querySelector('#todo-list .todo')
        const chip = document.getElementById('todo-chip').textContent
        return chip === '1/1' && li.classList.contains('done') && !!li.querySelector('.dot svg')
      })()`
    )
    await win.webContents.executeJavaScript(`document.querySelector('#todo-list .todo .del').click()`)
    await new Promise((r) => setTimeout(r, 400))
    results.todoRemovedAndCleared = await win.webContents.executeJavaScript(
      `(() => {
        const l = document.getElementById('todo-list')
        return l.children.length === 1 && l.textContent.includes('暂无待办') && document.getElementById('todo-chip').textContent === '0/0'
      })()`
    )
  } else {
    await probe('clockFormat', `(() => {
      const t = document.getElementById('clock-time').textContent
      const now = new Date()
      const expect = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0')
      return { text: t, matchesNow: t === expect, sec: /:\\d{2}$/.test(document.getElementById('clock-sec').textContent) }
    })()`)
    await probe('dateLine', `document.getElementById('clock-date').textContent`)
    await probe('calendar', `(() => {
      const now = new Date()
      const month = document.getElementById('cal-month').textContent
      const year = document.getElementById('cal-year').textContent
      const today = document.querySelectorAll('#cal-grid .d.today')
      return { month, year: Number(year), isCurMonth: month === ['一','二','三','四','五','六','七','八','九','十','十一','十二'][now.getMonth()] + '月', todayCount: today.length, todayText: today.length ? today[0].textContent : null }
    })()`)
    await probe('weather', `(() => ({
      city: document.getElementById('weather-city').textContent,
      temp: document.getElementById('weather-temp').textContent,
      cond: document.getElementById('weather-cond').textContent,
      detail: document.getElementById('weather-detail').textContent,
      meta: document.getElementById('weather-meta').textContent,
      forecastDays: document.querySelectorAll('#weather-forecast .f-day').length,
    }))()`)
    await probe('apiCards', `(() => {
      const cards = [...document.querySelectorAll('.api-card')]
      return cards.map(c => ({
        name: c.querySelector('.api-sym').textContent.trim(),
        price: c.querySelector('.api-price').textContent,
        stale: c.classList.contains('stale'),
        foot: c.querySelector('.api-foot').textContent,
      }))
    })()`)

    if (mode === 'main') {
      await win.webContents.executeJavaScript(
        `(() => {
          const inp = document.getElementById('todo-input')
          inp.value = '探针待办-持久化验证'
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        })()`
      )
      await new Promise((r) => setTimeout(r, 400))
      results.todoAdded = await win.webContents.executeJavaScript(
        `(() => {
          const l = document.getElementById('todo-list')
          return { liCount: l.querySelectorAll('li[data-id]').length, text: l.querySelector('.txt') ? l.querySelector('.txt').textContent : null }
        })()`
      )
      results.todoChip = await win.webContents.executeJavaScript(`document.getElementById('todo-chip').textContent`)
    }
  }

  console.log('[verify] mode=' + mode + ' ' + JSON.stringify(results, null, 1))
  app.quit()
})
