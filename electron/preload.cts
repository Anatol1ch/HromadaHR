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
    createAssignment: (id, input) => call(ipcChannels.personnelCreateAssignment, id, input),
    updateAssignment: (id, input) => call(ipcChannels.personnelUpdateAssignment, id, input),
    deleteAssignment: id => call(ipcChannels.personnelDeleteAssignment, id),
    deleteEmployee: id => call(ipcChannels.personnelDeleteEmployee, id),
    listEmployees: () => call(ipcChannels.personnelListEmployees),
    getEmployee: (id) => call(ipcChannels.personnelGetEmployee, id),
    createEmployee: (input) => call(ipcChannels.personnelCreateEmployee, input),
    updateEmployee: (id, input) => call(ipcChannels.personnelUpdateEmployee, id, input),
    getHistory: (id) => call(ipcChannels.personnelGetHistory, id),
    listDepartments: () => call(ipcChannels.personnelListDepartments),
    createDepartment: (input) => call(ipcChannels.personnelCreateDepartment, input),
    listPositions: () => call(ipcChannels.personnelListPositions),
    createPosition: (input) => call(ipcChannels.personnelCreatePosition, input),
  },
  backup: {
    getHistory: () => call(ipcChannels.backupGetHistory),
    getStatus: () => call(ipcChannels.backupGetStatus),
    chooseFolder: slot => call(ipcChannels.backupChooseFolder, slot),
    saveConfig: tokens => call(ipcChannels.backupSaveConfig, tokens),
    runManual: () => call(ipcChannels.backupRunManual),
    chooseRestore: () => call(ipcChannels.backupChooseRestore),
    confirmRestore: token => call(ipcChannels.backupConfirmRestore, token),
  },
  system: {
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
