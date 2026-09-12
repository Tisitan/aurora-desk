const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const FILE = path.join(__dirname, 'todos.json')
let cache = null

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error('[aurora-desk] todos save failed:', err.message)
  }
}

function register(ipcMain) {
  ipcMain.handle('todos:list', () => {
    cache ??= load()
    return cache
  })
  ipcMain.handle('todos:add', (_e, text) => {
    cache ??= load()
    const t = String(text ?? '').trim().slice(0, 100)
    if (t) {
      cache.push({ id: crypto.randomUUID(), text: t, done: false, due: null, createdAt: Date.now() })
      save()
    }
    return cache
  })
  ipcMain.handle('todos:toggle', (_e, id) => {
    cache ??= load()
    const it = cache.find((x) => x.id === id)
    if (it) {
      it.done = !it.done
      save()
    }
    return cache
  })
  ipcMain.handle('todos:remove', (_e, id) => {
    cache ??= load()
    cache = cache.filter((x) => x.id !== id)
    save()
    return cache
  })
}

module.exports = { register }
