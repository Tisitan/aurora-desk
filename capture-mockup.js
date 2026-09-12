const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.commandLine.appendSwitch('force-device-scale-factor', '2')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 320,
    height: 900,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
    },
  })

  await win.loadFile('mockup.html')
  const h = await win.webContents.executeJavaScript(
    'document.fonts.ready.then(() => document.documentElement.scrollHeight)'
  )
  win.setContentSize(320, h)
  await new Promise((r) => setTimeout(r, 400))

  const img = await win.webContents.capturePage()
  const out = path.join(__dirname, 'mockup.png')
  fs.writeFileSync(out, img.toPNG())
  console.log('[capture] saved:', out, 'size:', JSON.stringify(img.getSize()))
  app.quit()
})
