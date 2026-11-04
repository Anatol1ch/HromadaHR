import { z } from 'zod'

export const backupEvent = z.strictObject({
  time: z.iso.datetime(), operation: z.enum(['auto', 'manual', 'config', 'restore']),
  slot: z.union([z.literal(1), z.literal(2)]).nullable(),
  result: z.enum(['success', 'error', 'cancelled']),
  code: z.enum(['BUSY', 'NOT_CONFIGURED', 'INVALID_FOLDERS', 'FOLDER_UNAVAILABLE', 'INVALID_SELECTION',
    'INVALID_BACKUP', 'UNSUPPORTED_SCHEMA', 'BACKUP_FAILED', 'RESTORE_FAILED', 'RECOVERY_REQUIRED',
    'CANCELLED', 'STORAGE_UNAVAILABLE']).nullable(),
})
export type BackupEvent = z.infer<typeof backupEvent>
export const backupHistory = z.strictObject({ available: z.boolean(), events: z.array(backupEvent).max(200) })
export type BackupHistory = z.infer<typeof backupHistory>
