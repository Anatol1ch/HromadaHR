import type { StorageStatus } from '../shared/ipc.js'

// One Main-owned startup. Renderer (including StrictMode) only reads status.
export function createStartup(actions: {
  openWindow: () => Promise<boolean>
  initializeStorage: () => Promise<void>
  getStatus: () => StorageStatus
  startBackups: () => void
  isClosing: () => boolean
}) {
  let task: Promise<void> | undefined
  let initializing = false
  async function run() {
    if (!await actions.openWindow() || actions.isClosing()) return
    initializing = true
    try { await actions.initializeStorage() } finally { initializing = false }
    if (!actions.isClosing() && actions.getStatus().state === 'ready') actions.startBackups()
  }
  return { start: () => task ??= run(), isInitializing: () => initializing }
}
