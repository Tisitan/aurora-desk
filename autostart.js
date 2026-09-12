const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// XDG autostart：Cinnamon 的「启动应用程序」就是读 ~/.config/autostart/*.desktop。
// 开关语义 = 文件的增/删，不写 X-GNOME-Autostart-enabled=false 的僵尸条目。
const DIR = path.join(os.homedir(), '.config', 'autostart')
const FILE = path.join(DIR, 'aurora-desk.desktop')
const LAUNCHER = path.join(__dirname, 'start.sh')

function entry() {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Exec=${LAUNCHER}`,
    `Path=${__dirname}`,
    'Name=aurora-desk',
    'Comment=暗夜玻璃桌面挂件：时钟/待办/系统监控/天气/自定义数据源',
    'X-GNOME-Autostart-enabled=true',
    'Terminal=false',
    'Hidden=false',
    '',
  ].join('\n')
}

function isOn() {
  try {
    return fs.statSync(FILE).isFile()
  } catch {
    return false
  }
}

function apply(on) {
  try {
    if (on) {
      fs.mkdirSync(DIR, { recursive: true })
      fs.writeFileSync(FILE, entry())
      try { fs.chmodSync(LAUNCHER, 0o755) } catch { }
    } else {
      fs.rmSync(FILE, { force: true })
    }
    return isOn()
  } catch (err) {
    console.error('[aurora-desk] autostart toggle failed:', err.message)
    return isOn()
  }
}

module.exports = { isOn, apply, FILE }
