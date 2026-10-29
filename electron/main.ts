import { app, BrowserWindow, dialog } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const identity = 'HromadaHR'
app.setName(identity)
if (process.platform === 'win32') app.setAppUserModelId('local.hromadahr')

// Unpackaged built runs also use local files. Only pnpm dev opts into Vite.
const isDev = !app.isPackaged && process.argv.includes('--dev')
const directory = dirname(fileURLToPath(import.meta.url))
const devUrl = 'http://127.0.0.1:5176/'
app.setPath('userData', join(app.getPath('appData'), isDev ? 'HromadaHR-dev' : 'HromadaHR'))
// Select userData before the lock: development and built profiles are independent.
const hasLock = app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null

async function createWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: identity,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: join(directory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.removeMenu()
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.on('closed', () => { mainWindow = null })
  try {
    if (isDev) await window.loadURL(devUrl)
    else await window.loadFile(join(directory, '../dist/index.html'))
    console.log(`[HromadaHR] ${isDev ? 'dev' : 'built'}: ${window.webContents.getURL()}`)
  } catch (error) {
    console.error('[HromadaHR] Не вдалося завантажити інтерфейс:', error)
    dialog.showErrorBox(identity, 'Не вдалося завантажити інтерфейс. Перевірте збірку або запуск Vite у dev-режимі.')
    app.quit()
  }
}

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  void app.whenReady().then(createWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
