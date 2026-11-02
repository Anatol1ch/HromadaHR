import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc.js'
import { Storage, storagePath } from './storage/index.js'
import { BackupService } from './backup/service.js'
import { BackupController } from './backup/controller.js'

const identity = 'HromadaHR'
app.setName(identity)
if (process.platform === 'win32') app.setAppUserModelId('local.hromadahr')

// Unpackaged built runs also use local files. Only pnpm dev opts into Vite.
const isDev = !app.isPackaged && process.argv.includes('--dev')
const directory = dirname(fileURLToPath(import.meta.url))
const devUrl = 'http://127.0.0.1:5176/'
const builtFile = join(directory, '../../dist/index.html')
app.setPath('userData', join(app.getPath('appData'), isDev ? 'HromadaHR-dev' : 'HromadaHR'))
// Select userData before the lock: development and built profiles are independent.
const hasLock = app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null
const storage = new Storage()
const backups = new BackupService(storage)
const backupController = new BackupController(backups, () => mainWindow)

async function createWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: identity,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: join(directory, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) backupController.invalidate()
  })
  window.webContents.on('destroyed', () => backupController.invalidate())
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
    else await window.loadFile(builtFile)
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
  registerIpcHandlers(ipcMain, () => mainWindow, isDev ? devUrl : pathToFileURL(builtFile).href, () => ({
    name: app.getName(), version: app.getVersion(), mode: isDev ? 'dev' : 'built',
  }), () => storage.getStatus(), backupController, () => app.quit())
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  void app.whenReady().then(async () => {
    await storage.initializeSafely(() => storagePath(process.env.LOCALAPPDATA, isDev))
    backups.start()
    return createWindow()
  })
  let quitting = false
  app.on('before-quit', event => {
    if (backups.isBusy() && !quitting) {
      event.preventDefault()
      backups.stop()
      const wait = setInterval(() => {
        if (!backups.isBusy()) { clearInterval(wait); quitting = true; app.quit() }
      }, 100)
    }
  })
  app.on('will-quit', () => { backups.stop(); backupController.invalidate(); storage.close() })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
