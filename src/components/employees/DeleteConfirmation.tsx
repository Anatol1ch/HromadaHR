import type { ReactNode } from 'react'
import ConfirmDialog from '../ConfirmDialog'

/** Compatibility adapter; personnel content stays local, all modal behavior is AID's. */
export default function DeleteConfirmation({ title, children, pending, error, onCancel, onConfirm, confirmLabel }: {
  title: string; children: ReactNode; pending: boolean; error: string; onCancel: () => void; onConfirm: () => void | Promise<void>; confirmLabel: string
}) {
  return <ConfirmDialog title={title} message={children} confirmLabel={confirmLabel} busyLabel="Видалення…"
    confirmDisabled={pending} error={error} onCancel={onCancel} onConfirm={onConfirm} />
}
