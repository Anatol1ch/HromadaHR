import { PersonnelControlService } from './personnel-control/service.js'
import { ZoomController } from './zoom.js'
import { createStartup } from './startup.js'
import { openContact } from './contacts.js'
import { PersonnelService } from './personnel/service.js'
import { SeniorityRanksService } from './seniority-ranks/service.js'
import { LeaveService } from './leave/service.js'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
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
const iconDirectory = app.isPackaged ? join(process.resourcesPath, 'assets') : join(directory, 'assets')
app.setPath('userData', join(app.getPath('appData'), isDev ? 'HromadaHR-dev' : 'HromadaHR'))
// Select userData before the lock: development and built profiles are independent.
const hasLock = app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null
const zoom = new ZoomController(join(app.getPath('userData'), 'interface-settings.json'), () => mainWindow?.webContents ?? null)
const storage = new Storage()
const backups = new BackupService(storage)
let closing = false
let acknowledgeRenderer: () => void
const rendererMounted = new Promise<void>(resolve => { acknowledgeRenderer = resolve })
const startBackups = () => { if (!closing && storage.getStatus().state === 'ready') backups.start() }
const backupController = new BackupController(backups, () => mainWindow, startBackups)
const startup = createStartup({
  openWindow: createWindow,
  initializeStorage: () => storage.initializeSafely(() => storagePath(process.env.LOCALAPPDATA, isDev)),
  getStatus: () => storage.getStatus(), startBackups, isClosing: () => closing,
})

async function createWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: identity,
    icon: join(iconDirectory, process.platform === 'win32' ? 'hromadahr.ico' : 'hromadahr.png'),
    backgroundColor: '#f7f6fa',
    show: false,
    webPreferences: {
      preload: join(directory, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const painted = new Promise<boolean>(resolve => {
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) {
        // AID: maximize before showing; Windows handles work area and DPI.
        zoom.apply()
        window.maximize()
        window.show()
        resolve(true)
      }
    })
    window.once('closed', () => resolve(false))
  })
  const closed = new Promise<false>(resolve => { window.once('closed', () => resolve(false)) })
  mainWindow = window
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) backupController.invalidate()
  })
  window.webContents.on('destroyed', () => backupController.invalidate())
  window.removeMenu()
  window.webContents.on('did-finish-load', zoom.apply)
  window.webContents.on('before-input-event', (event, input) => {
    if (zoom.shortcut(input)) event.preventDefault()
  })
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
    if (!await painted) return false
    // The first trusted status read comes from the mounted App effect. Wait
    // for it too, so dynamic React/CSS loading precedes SQLite preparation.
    return await Promise.race([rendererMounted.then(() => true), closed])
  } catch (error) {
    console.error('[HromadaHR] Не вдалося завантажити інтерфейс:', error)
    dialog.showErrorBox(identity, 'Не вдалося завантажити інтерфейс. Перевірте збірку або запуск Vite у dev-режимі.')
    app.quit()
    return false
  }
}

if (!hasLock) {
  app.quit()
} else {
  registerIpcHandlers(ipcMain, () => mainWindow, isDev ? devUrl : pathToFileURL(builtFile).href, () => ({
    name: app.getName(), version: app.getVersion(), mode: isDev ? 'dev' : 'built',
  }), () => {
    acknowledgeRenderer()
    return storage.getStatus()
  }, backupController, () => app.quit(), new PersonnelService(storage, () => backups.isBusy()), new LeaveService(storage, () => backups.isBusy()),
  id => openContact(id, uri => shell.openExternal(uri)), backupController.getHistory, zoom, new SeniorityRanksService(storage, () => backups.isBusy()), new PersonnelControlService(storage, () => backups.isBusy()))
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  void app.whenReady().then(startup.start).catch(() => {
    dialog.showErrorBox(identity, 'Не вдалося підготувати застосунок. Перезапустіть HromadaHR або зверніться по технічну допомогу.')
    app.quit()
  })
  let quitting = false
  app.on('before-quit', event => {
    closing = true
    if ((startup.isInitializing() || backups.isBusy()) && !quitting) {
      event.preventDefault()
      backups.stop()
      const wait = setInterval(() => {
        if (!startup.isInitializing() && !backups.isBusy()) { clearInterval(wait); quitting = true; app.quit() }
      }, 100)
    }
  })
  app.on('will-quit', () => { backups.stop(); backupController.invalidate(); storage.close() })
  app.on('activate', () => {
    if (!closing && BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
