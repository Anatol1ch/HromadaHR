import { zoomPercent, zoomStatus } from './zoom.js'
import type { ZoomController } from './zoom.js'
import { backupHistory } from '../shared/backupHistory.js'
import { PersonnelError } from './personnel/service.js'
import type { PersonnelService } from './personnel/service.js'
import * as personnelSchemas from './personnel/schemas.js'
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { ipcChannels } from '../shared/ipc.js'
import type { IpcOperations, IpcResult, StorageStatus, SystemInfo } from '../shared/ipc.js'
import type { BackupController } from './backup/controller.js'
import { BackupError } from './backup/files.js'

const getInfoArgs = z.tuple([]) satisfies z.ZodType<IpcOperations[typeof ipcChannels.systemGetInfo]['args']>
const systemInfo = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1),
  mode: z.enum(['dev', 'built']),
}) satisfies z.ZodType<SystemInfo>

const storageStatus = z.union([
  z.strictObject({ state: z.enum(['initializing', 'closed']) }),
  z.strictObject({ state: z.literal('ready'), created: z.boolean(), schemaVersion: z.number().int().positive() }),
  z.strictObject({ state: z.literal('error'), code: z.enum([
    'CORRUPT', 'UNSUPPORTED_SCHEMA', 'FILESYSTEM', 'BUSY', 'MIGRATION_FAILED', 'INITIALIZATION_FAILED', 'BACKUP_REQUIRED', 'RECOVERY_REQUIRED', 'MISSING_DATABASE',
  ]) }),
]) satisfies z.ZodType<StorageStatus>

const backupError = z.enum(['BUSY', 'NOT_CONFIGURED', 'INVALID_FOLDERS', 'FOLDER_UNAVAILABLE', 'INVALID_SELECTION',
  'INVALID_BACKUP', 'UNSUPPORTED_SCHEMA', 'BACKUP_FAILED', 'RESTORE_FAILED', 'RECOVERY_REQUIRED', 'CANCELLED', 'STORAGE_UNAVAILABLE'])
const backupTarget = z.strictObject({ slot: z.union([z.literal(1), z.literal(2)]), path: z.string().nullable(), available: z.boolean(),
  autoDay: z.string().nullable(), lastAttempt: z.string().nullable(), lastSuccess: z.string().nullable(),
  lastKind: z.enum(['auto', 'manual']).nullable(), error: backupError.nullable(), fileName: z.string().nullable() })
const backupStatus = z.strictObject({ targets: z.tuple([backupTarget, backupTarget]), sameVolume: z.boolean(), busy: z.boolean(),
  lastRestore: z.enum(['success', 'rolled-back']).nullable() })
const token = z.string().uuid()

export function registerIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  getWindow: () => BrowserWindow | null,
  allowedUrl: string,
  getInfo: () => SystemInfo,
  getStorageStatus: () => StorageStatus,
  backup: Pick<BackupController, 'openBackupFolder' | 'getStatus' | 'chooseFolder' | 'saveConfig' | 'runManual' | 'chooseRestore' | 'confirmRestore' | 'retryStorage'>,
  quit: () => void,
  personnel: PersonnelService,
  openContact: (id: import('../shared/contacts.js').ContactId) => Promise<boolean> = async () => false,
  getBackupHistory: () => import('../shared/backupHistory.js').BackupHistory = () => ({ available: false, events: [] }),
  zoom?: Pick<ZoomController, 'get' | 'set'>,
) {
  register(ipcChannels.systemGetZoom, z.tuple([]), zoomStatus, () => {
    if (!zoom) throw new Error('Zoom unavailable')
    return zoom.get()
  })
  register(ipcChannels.systemSetZoom, z.tuple([zoomPercent]), zoomStatus, ([percent]) => {
    if (!zoom) throw new Error('Zoom unavailable')
    return zoom.set(percent)
  })
  register(ipcChannels.systemOpenContact, z.tuple([z.enum(['phone', 'workEmail', 'personalEmail', 'telegram'])]), z.boolean(), ([id]) => openContact(id))
  register(ipcChannels.backupGetHistory, z.tuple([]), backupHistory, getBackupHistory)
  register(ipcChannels.systemGetInfo, getInfoArgs, systemInfo, getInfo)
  register(ipcChannels.storageGetStatus, z.tuple([]), storageStatus, getStorageStatus)
  register(ipcChannels.storageRetry, z.tuple([]), storageStatus, backup.retryStorage)
  register(ipcChannels.systemQuit, z.tuple([]), z.null(), () => { quit(); return null })
  register(ipcChannels.backupOpenFolder, z.tuple([z.union([z.literal(1), z.literal(2)])]), z.null(), ([slot]) => backup.openBackupFolder(slot))
  register(ipcChannels.backupGetStatus, z.tuple([]), backupStatus, backup.getStatus)
  register(ipcChannels.backupChooseFolder, z.tuple([z.union([z.literal(1), z.literal(2)])]),
    z.strictObject({ token, path: z.string() }).nullable(), ([slot]) => backup.chooseFolder(slot))
  register(ipcChannels.backupSaveConfig, z.tuple([z.tuple([token.nullable(), token.nullable()])]), backupStatus, ([tokens]) => backup.saveConfig(tokens))
  register(ipcChannels.backupRunManual, z.tuple([]), backupStatus, backup.runManual)
  register(ipcChannels.backupChooseRestore, z.tuple([]),
    z.strictObject({ token, fileName: z.string(), schemaVersion: z.number().int().positive() }).nullable(), backup.chooseRestore)
  register(ipcChannels.backupConfirmRestore, z.tuple([token]), z.strictObject({ restored: z.boolean() }), ([value]) => backup.confirmRestore(value))

  register(ipcChannels.personnelCreateAssignment, z.tuple([personnelSchemas.id, personnelSchemas.assignmentInput]), personnelSchemas.employeeCard,
    ([id, input]) => personnel.createAssignment(id, input))
  register(ipcChannels.personnelUpdateAssignment, z.tuple([personnelSchemas.id, personnelSchemas.assignmentInput]), personnelSchemas.employeeCard,
    ([id, input]) => personnel.updateAssignment(id, input))
  register(ipcChannels.personnelDeleteAssignment, z.tuple([personnelSchemas.id]), personnelSchemas.employeeCard,
    ([id]) => personnel.deleteAssignment(id))
  register(ipcChannels.personnelDeleteEmployee, z.tuple([personnelSchemas.id]), z.null(),
    ([id]) => personnel.deleteEmployee(id))
  register(ipcChannels.personnelListEmployees, z.tuple([]), personnelSchemas.employeeCard.array(),
    (_args) => personnel.listEmployees())
  register(ipcChannels.personnelGetEmployee, z.tuple([personnelSchemas.id]), personnelSchemas.employeeCard,
    ([id]) => personnel.getEmployee(id))
  register(ipcChannels.personnelCreateEmployee, z.tuple([personnelSchemas.createEmployee]), personnelSchemas.employeeCard,
    ([input]) => personnel.createEmployee(input))
  register(ipcChannels.personnelUpdateEmployee, z.tuple([personnelSchemas.id, personnelSchemas.employeeDetails]), personnelSchemas.employeeCard,
    ([id, input]) => personnel.updateEmployee(id, input))
  register(ipcChannels.personnelGetHistory, z.tuple([personnelSchemas.id]), personnelSchemas.assignment.array(),
    ([id]) => personnel.getHistory(id))
  register(ipcChannels.personnelListDepartments, z.tuple([]), personnelSchemas.department.array(),
    (_args) => personnel.listDepartments())
  register(ipcChannels.personnelCreateDepartment, z.tuple([personnelSchemas.departmentInput]), personnelSchemas.department,
    ([input]) => personnel.createDepartment(input))
  register(ipcChannels.personnelListPositions, z.tuple([]), personnelSchemas.position.array(),
    (_args) => personnel.listPositions())
  register(ipcChannels.personnelCreatePosition, z.tuple([personnelSchemas.positionInput]), personnelSchemas.position,
    ([input]) => personnel.createPosition(input))

  // Internal registration only: channels and signatures come from the allowlist.
  // Keep security checks here when adding future explicitly allowed operations.
  function register<Channel extends keyof IpcOperations>(
    channel: Channel,
    argsSchema: z.ZodType<IpcOperations[Channel]['args']>,
    resultSchema: z.ZodType<IpcOperations[Channel]['result']>,
    execute: (args: IpcOperations[Channel]['args']) => IpcOperations[Channel]['result'] | Promise<IpcOperations[Channel]['result']>,
  ) {
    // Register once per app lifecycle; resolve the current window for every call.
    ipc.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]): IpcResult<IpcOperations[Channel]['result']> | Promise<IpcResult<IpcOperations[Channel]['result']>> => {
      try {
        const window = getWindow()
        if (!window || window.isDestroyed()) return { ok: false, error: { code: 'FORBIDDEN' } }
        const contents = window.webContents
        if (contents.isDestroyed() || event.sender !== contents ||
          !event.senderFrame || event.senderFrame !== contents.mainFrame ||
          event.senderFrame.url !== allowedUrl) {
          return { ok: false, error: { code: 'FORBIDDEN' } }
        }
        const parsed = argsSchema.safeParse(args)
        if (!parsed.success) return { ok: false, error: { code: 'INVALID_ARGUMENTS' } }
        const result = execute(parsed.data)
        // Keep synchronous diagnostics synchronous; await privileged operations
        // before validating output and normalizing errors. No authentication.
        if (result instanceof Promise) return result.then(data => ({ ok: true as const, data: resultSchema.parse(data) }))
          .catch(error => ({ ok: false as const, error: { code: (error instanceof BackupError || error instanceof PersonnelError) ? error.code : 'INTERNAL_ERROR' as const } }))
        return { ok: true, data: resultSchema.parse(result) }
      } catch (error) {
        // Never return exceptions, paths or Electron objects to the renderer.
        return { ok: false, error: { code: (error instanceof BackupError || error instanceof PersonnelError) ? error.code : 'INTERNAL_ERROR' } }
      }
    })
  }
}
