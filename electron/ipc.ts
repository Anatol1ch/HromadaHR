import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { ipcChannels } from '../shared/ipc.js'
import type { IpcOperations, IpcResult, StorageStatus, SystemInfo } from '../shared/ipc.js'

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
    'CORRUPT', 'UNSUPPORTED_SCHEMA', 'FILESYSTEM', 'BUSY', 'MIGRATION_FAILED', 'INITIALIZATION_FAILED', 'BACKUP_REQUIRED',
  ]) }),
]) satisfies z.ZodType<StorageStatus>

export function registerIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  getWindow: () => BrowserWindow | null,
  allowedUrl: string,
  getInfo: () => SystemInfo,
  getStorageStatus: () => StorageStatus,
) {
  register(ipcChannels.systemGetInfo, getInfoArgs, systemInfo, getInfo)
  register(ipcChannels.storageGetStatus, z.tuple([]), storageStatus, getStorageStatus)

  // Internal registration only: channels and signatures come from the allowlist.
  // Keep security checks here when adding future explicitly allowed operations.
  function register<Channel extends keyof IpcOperations>(
    channel: Channel,
    argsSchema: z.ZodType<IpcOperations[Channel]['args']>,
    resultSchema: z.ZodType<IpcOperations[Channel]['result']>,
    execute: (args: IpcOperations[Channel]['args']) => IpcOperations[Channel]['result'],
  ) {
    // Register once per app lifecycle; resolve the current window for every call.
    ipc.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]): IpcResult<IpcOperations[Channel]['result']> => {
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
        // Public diagnostic only. Future protected handlers must check access here,
        // after sender/argument validation and before executing any operation.
        // No authentication or permissive authorization placeholder exists today.
        return { ok: true, data: resultSchema.parse(execute(parsed.data)) }
      } catch {
        // Never return exceptions, paths or Electron objects to the renderer.
        return { ok: false, error: { code: 'INTERNAL_ERROR' } }
      }
    })
  }
}
