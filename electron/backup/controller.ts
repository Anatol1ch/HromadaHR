import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { BackupSlot } from '../../shared/backup.js'
import type { BackupService } from './service.js'
import { BackupError } from './files.js'

export class BackupController {
  private generation = 0
  constructor(private service: BackupService, private getWindow: () => BrowserWindow | null) {}
  invalidate() { this.generation++; this.service.invalidateSelections() }
  getStatus = () => this.service.getStatus()
  getHistory = () => this.service.getHistory()
  runManual = () => this.service.runManual()
  retryStorage = () => this.service.retryStorage()
  saveConfig = async (tokens: [string | null, string | null]) => {
    const status = await this.service.saveConfig(tokens)
    setImmediate(() => { void this.service.runAutomatic().catch(() => {}) })
    return status
  }
  private window() {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) throw new BackupError('INVALID_SELECTION')
    return window
  }
  private check(window: BrowserWindow, generation: number) {
    if (window !== this.getWindow() || window.isDestroyed() || generation !== this.generation) throw new BackupError('INVALID_SELECTION')
  }
  chooseFolder = (slot: BackupSlot) => this.service.chooseFolder(slot, async () => {
    const window = this.window(), generation = this.generation
    const result = await dialog.showOpenDialog(window, { title: `Тека резервування ${slot}`, properties: ['openDirectory', 'dontAddToRecent'] })
    this.check(window, generation)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  chooseRestore = () => this.service.chooseRestore(async () => {
    const window = this.window(), generation = this.generation
    const result = await dialog.showOpenDialog(window, { title: 'Виберіть резервну копію HromadaHR',
      properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'SQLite', extensions: ['db'] }] })
    this.check(window, generation)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  confirmRestore = async (token: string) => {
    const result = await this.service.confirmRestore(token, async () => {
      const window = this.window(), generation = this.generation
      const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Відновлення HromadaHR',
        message: 'Замінити поточні дані вибраною резервною копією?',
        detail: this.service.emergencyAvailable() ?
          'Початкові файли буде збережено для діагностики. Це не гарантовано справна SQLite-копія. Після відновлення інтерфейс перезавантажиться.' :
          'Перед заміною буде створено захисну копію. Після відновлення інтерфейс перезавантажиться.',
        buttons: ['Скасувати', 'Відновити дані'], defaultId: 0, cancelId: 0, noLink: true })
      this.check(window, generation)
      return answer.response === 1
    })
    if (result.restored) {
      setTimeout(() => {
        const window = this.getWindow()
        if (window && !window.isDestroyed()) window.webContents.reload()
      }, 100)
    }
    return result
  }
}
