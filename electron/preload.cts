import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc.js'
import type { HromadaHRApi, IpcOperations, IpcResult } from '../shared/ipc.js'

// Private transport; only the explicit methods below cross contextBridge.
async function call<C extends keyof IpcOperations>(channel: C, ...args: IpcOperations[C]['args']): Promise<IpcResult<IpcOperations[C]['result']>> {
  try { return await ipcRenderer.invoke(channel, ...args) }
  catch { return { ok: false, error: { code: 'UNAVAILABLE' } } }
}

const api: HromadaHRApi = {
  personnel: {
    deleteEmployee: id => call(ipcChannels.personnelDeleteEmployee, id),
    listEmployees: () => call(ipcChannels.personnelListEmployees),
    getEmployee: (id) => call(ipcChannels.personnelGetEmployee, id),
    createEmployee: (input) => call(ipcChannels.personnelCreateEmployee, input),
    updateEmployee: (id, input) => call(ipcChannels.personnelUpdateEmployee, id, input),
    listDepartments: () => call(ipcChannels.personnelListDepartments),
    createDepartment: (input) => call(ipcChannels.personnelCreateDepartment, input),
    listPositions: () => call(ipcChannels.personnelListPositions),
    createPosition: (input) => call(ipcChannels.personnelCreatePosition, input),
  },
  backup: {
    listCopies: () => call(ipcChannels.backupListCopies),
    selectCopy: id => call(ipcChannels.backupSelectCopy, id),
    openBackupFolder: slot => call(ipcChannels.backupOpenFolder, slot),
    getHistory: () => call(ipcChannels.backupGetHistory),
    getStatus: () => call(ipcChannels.backupGetStatus),
    chooseFolder: slot => call(ipcChannels.backupChooseFolder, slot),
    saveConfig: tokens => call(ipcChannels.backupSaveConfig, tokens),
    runManual: () => call(ipcChannels.backupRunManual),
    chooseRestore: () => call(ipcChannels.backupChooseRestore),
    confirmRestore: token => call(ipcChannels.backupConfirmRestore, token),
  },
  system: {
    getZoom: () => call(ipcChannels.systemGetZoom),
    setZoom: percent => call(ipcChannels.systemSetZoom, percent),
    openContact: id => call(ipcChannels.systemOpenContact, id),
    quit: () => call(ipcChannels.systemQuit),
    getInfo: async () => {
      try {
        return await ipcRenderer.invoke(ipcChannels.systemGetInfo)
      } catch {
        return { ok: false, error: { code: 'UNAVAILABLE' } }
      }
    },
  },
  storage: {
    retry: () => call(ipcChannels.storageRetry),
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
