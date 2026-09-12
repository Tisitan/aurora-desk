const { execFile } = require('node:child_process')

// 层级模式：
//   below（默认，桌面级）→ setAlwaysOnTop(false) + _NET_WM_STATE_BELOW：普通窗口盖住挂件，
//     Super+D 显示桌面后挂件随桌面露出，点击挂件仍能正常获焦交互（区别于 desktop 窗型）；
//   top → 移除 BELOW + screen-saver 层：挂件压在一切窗口之上。
// 窗口 id 取 Electron 原生句柄（X11 下即 XID），比按标题 xdotool search 可靠：不受改名/多窗影响。

function xidOf(win) {
  try {
    const h = win.getNativeWindowHandle()
    if (!h || !h.length) return null
    const v32 = h.readUInt32LE(0)
    if (v32) return '0x' + v32.toString(16)
    if (h.length >= 8) {
      const v64 = Number(h.readBigUInt64LE(0))
      if (v64) return '0x' + v64.toString(16)
    }
  } catch { }
  return null
}

function wmctrl(args, done) {
  execFile('wmctrl', args, (err, _out, stderr) => {
    if (err) console.error('[aurora-desk] wmctrl', args.join(' '), 'failed:', (stderr || err.message).trim())
    if (done) done(!err)
  })
}

function apply(win, mode) {
  if (win === null || win.isDestroyed()) return
  const xid = xidOf(win)
  if (!xid) {
    console.error('[aurora-desk] layer: no XID from native handle, keep WM default layer')
    return
  }
  if (mode === 'below') {
    win.setAlwaysOnTop(false)
    wmctrl(['-i', '-r', xid, '-b', 'add,_NET_WM_STATE_BELOW'], (ok) =>
      console.log('[aurora-desk] layer=below xid=' + xid, ok ? 'BELOW applied' : 'BELOW rejected'))
  } else {
    wmctrl(['-i', '-r', xid, '-b', 'remove,_NET_WM_STATE_BELOW'], () => {
      win.setAlwaysOnTop(true, 'screen-saver')
      console.log('[aurora-desk] layer=top xid=' + xid + ' screen-saver applied')
    })
  }
}

module.exports = { apply, xidOf }
