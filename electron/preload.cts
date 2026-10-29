import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc.js'
import type { HromadaHRApi } from '../shared/ipc.js'

const api: HromadaHRApi = {
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
