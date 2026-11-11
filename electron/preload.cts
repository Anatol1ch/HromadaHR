import { contextBridge, ipcRenderer } from 'electron'
import type { HromadaHRApi, IpcOperations, IpcResult } from '../shared/ipc.js'
import { ipcChannels } from '../shared/ipc.js'

// Private transport; only the explicit methods below cross contextBridge.
async function call<C extends keyof IpcOperations>(channel: C, ...args: IpcOperations[C]['args']): Promise<IpcResult<IpcOperations[C]['result']>> {
  try { return await ipcRenderer.invoke(channel, ...args) }
  catch { return { ok: false, error: { code: 'UNAVAILABLE' } } }
}

const api: HromadaHRApi = {
  seniorityRanks: {
    getAllowance: (id) => call(ipcChannels.seniorityGetAllowance, id),
    saveAllowance: (id, input) => call(ipcChannels.senioritySaveAllowance, id, input),
    clearAllowance: (id) => call(ipcChannels.seniorityClearAllowance, id),
    getRank: (id) => call(ipcChannels.seniorityGetRank, id),
    saveRank: (id, input) => call(ipcChannels.senioritySaveRank, id, input),
    clearRank: (id) => call(ipcChannels.seniorityClearRank, id),
  },
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
    getDictionary: kind => call(ipcChannels.personnelGetDictionary, kind),
    renameDictionaryEntry: (kind, id, name, revision) => call(ipcChannels.personnelRenameDictionaryEntry, kind, id, name, revision),
    deleteDictionaryEntry: (kind, id, revision) => call(ipcChannels.personnelDeleteDictionaryEntry, kind, id, revision),
    reorderDictionary: (kind, ids, revision) => call(ipcChannels.personnelReorderDictionary, kind, ids, revision),
  },
  leave: {
    listRights: id => call(ipcChannels.leaveListRights,id),
    saveRights: (id,input) => call(ipcChannels.leaveSaveRights,id,input),
    getServiceLeaveStart: id => call(ipcChannels.leaveGetServiceLeaveStart, id),
    saveServiceLeaveStart: (id, date) => call(ipcChannels.leaveSaveServiceLeaveStart, id, date),
    getRecord: id => call(ipcChannels.leaveGetRecord, id),
    updateLeave: input => call(ipcChannels.leaveUpdate, input),
    cancelLeave: (id, revision, reason) => call(ipcChannels.leaveCancel, id, revision, reason),
    proposeEditAllocation: (id, revision, type, days, startDate, endDate) => call(ipcChannels.leaveProposeEditAllocation, id, revision, type, days, startDate, endDate),
    registerLeave: input => call(ipcChannels.leaveRegister, input),
    listRecords: employeeId => call(ipcChannels.leaveListRecords, employeeId),
    getBalances: employeeId => call(ipcChannels.leaveGetBalances, employeeId),
    proposeAllocation: (employeeId, type, days, startDate, endDate) => call(ipcChannels.leaveProposeAllocation, employeeId, type, days, startDate, endDate),
    listPeriods: employeeId => call(ipcChannels.leaveListPeriods, employeeId),
    proposePeriods: (employeeId, throughDate, leaveType) => call(ipcChannels.leaveProposePeriods, employeeId, throughDate, leaveType),
    savePeriods: (employeeId, periods) => call(ipcChannels.leaveSavePeriods, employeeId, periods),
    deletePeriod: periodId => call(ipcChannels.leaveDeletePeriod, periodId),
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
