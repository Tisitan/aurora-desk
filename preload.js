const { contextBridge, ipcRenderer } = require('electron')

// 推送订阅一律返回退订函数：模块 mount 时订阅、unmount 时真正 removeListener（RAM 纪律）
function pushChannel(channel) {
  const subs = new Map()
  return (cb) => {
    const known = subs.get(cb)
    if (known) return known
    const listener = (_event, payload) => cb(payload)
    ipcRenderer.on(channel, listener)
    const off = () => {
      ipcRenderer.removeListener(channel, listener)
      subs.delete(cb)
    }
    subs.set(cb, off)
    return off
  }
}

contextBridge.exposeInMainWorld('deskStats', {
  onStats: pushChannel('stats'),
  getStats: () => ipcRenderer.invoke('stats:get'),
})

contextBridge.exposeInMainWorld('widgetData', {
  onWeather: pushChannel('weather'),
  getWeather: () => ipcRenderer.invoke('weather:get'),
  onApiCards: pushChannel('api-cards'),
  getApiCards: () => ipcRenderer.invoke('api:get'),
  todos: {
    list: () => ipcRenderer.invoke('todos:list'),
    add: (text) => ipcRenderer.invoke('todos:add', text),
    toggle: (id) => ipcRenderer.invoke('todos:toggle', id),
    remove: (id) => ipcRenderer.invoke('todos:remove', id),
  },
})

// 设置抽屉专用桥：只暴露固定通道，key 出口在主进程已打码
contextBridge.exposeInMainWorld('deskUI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onAppearance: pushChannel('appearance'),
  onClickthrough: pushChannel('clickthrough'),
  onLayout: pushChannel('layout'),
  reportContent: (h) => ipcRenderer.invoke('layout:content', h),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on) => ipcRenderer.invoke('autostart:set', on),
  quit: () => ipcRenderer.invoke('app:quit'),
})
