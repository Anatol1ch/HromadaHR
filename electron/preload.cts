import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc.js'
import type { HromadaHRApi, IpcOperations, IpcResult } from '../shared/ipc.js'

// Private transport; only the explicit methods below cross contextBridge.
async function call<C extends keyof IpcOperations>(channel: C, ...args: IpcOperations[C]['args']): Promise<IpcResult<IpcOperations[C]['result']>> {
  try { return await ipcRenderer.invoke(channel, ...args) }
  catch { return { ok: false, error: { code: 'UNAVAILABLE' } } }
}

const api: HromadaHRApi = {
  backup: {
    getStatus: () => call(ipcChannels.backupGetStatus),
    chooseFolder: slot => call(ipcChannels.backupChooseFolder, slot),
    saveConfig: tokens => call(ipcChannels.backupSaveConfig, tokens),
    runManual: () => call(ipcChannels.backupRunManual),
    chooseRestore: () => call(ipcChannels.backupChooseRestore),
    confirmRestore: token => call(ipcChannels.backupConfirmRestore, token),
  },
  system: {
    getInfo: async () => {
      try {
        return await ipcRenderer.invoke(ipcChannels.systemGetInfo)
      } catch {
        return { ok: false, error: { code: 'UNAVAILABLE' } }
      }
    },
  },
  storage: {
    getStatus: async () => {
      try {
        return await ipcRenderer.invoke(ipcChannels.storageGetStatus)
      } catch {
        return { ok: false, error: { code: 'UNAVAILABLE' } }
      }
    },
  },
}

contextBridge.exposeInMainWorld('hromadaHR', api)
