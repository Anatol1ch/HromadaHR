import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import Alert from '../Alert'

export default function DeleteConfirmation({ title, children, pending, error, onCancel, onConfirm, confirmLabel }: {
  title: string; children: ReactNode; pending: boolean; error: string; onCancel: () => void; onConfirm: () => void; confirmLabel: string
}) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null)
  const titleId = useId(), descriptionId = useId()
  useEffect(() => {
    const node = dialog.current!
    const previous = document.activeElement
    node.showModal(); cancel.current?.focus()
    return () => { node.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="employee-delete-dialog" role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!pending) onCancel() }}>
    <h2 id={titleId}>{title}</h2><div id={descriptionId}>{children}</div>
    {error && <Alert variant="error">{error}</Alert>}
    <div className="employee-actions">
      <button ref={cancel} type="button" className="secondary-button" disabled={pending} onClick={onCancel}>Скасувати</button>
      <button type="button" className="danger-button" disabled={pending} aria-busy={pending} onClick={onConfirm}>{pending ? 'Видалення…' : confirmLabel}</button>
    </div>
  </dialog>
}
