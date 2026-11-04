import { z } from 'zod'

export const backupEvent = z.strictObject({
  time: z.iso.datetime(), operation: z.enum(['auto', 'manual', 'config', 'restore']),
  slot: z.union([z.literal(1), z.literal(2)]).nullable(),
  result: z.enum(['success', 'partial', 'error', 'cancelled']),
  snapshotId: z.string().regex(/^[0-9a-f]{64}$/).optional(), duplicate: z.boolean().optional(),
  locations: z.array(z.strictObject({ slot: z.union([z.literal(1), z.literal(2)]), result: z.enum(['success', 'error']),
    code: z.enum(['BUSY', 'NOT_CONFIGURED', 'INVALID_FOLDERS', 'FOLDER_UNAVAILABLE', 'INVALID_SELECTION', 'INVALID_BACKUP', 'UNSUPPORTED_SCHEMA', 'BACKUP_FAILED', 'RESTORE_FAILED', 'RECOVERY_REQUIRED', 'CANCELLED', 'STORAGE_UNAVAILABLE']).nullable(),
  })).length(2).optional(),
  code: z.enum(['BUSY', 'NOT_CONFIGURED', 'INVALID_FOLDERS', 'FOLDER_UNAVAILABLE', 'INVALID_SELECTION',
    'INVALID_BACKUP', 'UNSUPPORTED_SCHEMA', 'BACKUP_FAILED', 'RESTORE_FAILED', 'RECOVERY_REQUIRED',
    'CANCELLED', 'STORAGE_UNAVAILABLE']).nullable(),
})
export type BackupEvent = z.infer<typeof backupEvent>
export const backupHistory = z.strictObject({ available: z.boolean(), events: z.array(backupEvent).max(200) })
export type BackupHistory = z.infer<typeof backupHistory>
