import { CalendarCheck, Plus, Trash2 } from 'lucide-react'
import DateField from '../DateField'
import { formatDateInput } from '../../lib/dates'
import type { ServiceAccountingDraftErrors, ServicePeriodDraft } from './service-accounting-form'

export default function ServicePeriodEditor({ rows, errors, today, hireDate, busy, hasHireDate, onChange, createId }: {
  rows: ServicePeriodDraft[]
  errors: ServiceAccountingDraftErrors['periods']
  today: string
  hireDate: string
  busy: boolean
  hasHireDate: boolean
  onChange: (next: ServicePeriodDraft[]) => void
  createId: () => string
}) {
  const hasCurrent = rows.some(row => row.current)
  const update = (id: string, change: (row: ServicePeriodDraft) => ServicePeriodDraft) => onChange(rows.map(row => row.id === id ? change(row) : row))
  const addCurrentFromHire = () => {
    if (!hasHireDate || hasCurrent) return
    onChange([...rows, { id: createId(), startDate: hireDate, startDraft: formatDateInput(hireDate), endDate: '', endDraft: '', current: true }])
  }
  return <div className="service-period-editor">
    {rows.length === 0 ? <div className="service-period-empty">Періодів ще немає. Додайте завершений або поточний період.</div> : rows.map((row, index) => {
      const fieldErrors = errors[row.id] ?? {}
      return <fieldset key={row.id} className="service-period-card" disabled={busy}>
        <legend className="visually-hidden">Період {index + 1}</legend>
        <div className="service-period-header"><strong aria-hidden="true">Період {index + 1}</strong><button type="button" className="icon-button danger-action service-period-remove" aria-label={`Видалити період ${index + 1}`} title={`Видалити період ${index + 1}`} onClick={() => onChange(rows.filter(item => item.id !== row.id))}><Trash2 size={16} aria-hidden="true"/></button></div>
        <div className="employee-form-grid service-period-dates">
          <div className="recipient-field employee-field"><label htmlFor={`service-period-${row.id}-start`}>Початок періоду *</label><DateField id={`service-period-${row.id}-start`} value={row.startDate} initialDraft={row.startDraft} max={today} required disabled={busy} error={fieldErrors.startDate} onDraftChange={text => update(row.id, value => ({ ...value, startDraft: text }))} onChange={iso => update(row.id, value => ({ ...value, startDate: iso, startDraft: formatDateInput(iso) }))}/></div>
          <div className="recipient-field employee-field"><label htmlFor={`service-period-${row.id}-end`}>Завершення періоду{row.current ? ' (дотепер)' : ' *'}</label><DateField id={`service-period-${row.id}-end`} value={row.endDate} initialDraft={row.endDraft} max={today} required={!row.current} disabled={busy || row.current} error={fieldErrors.endDate} onDraftChange={text => update(row.id, value => ({ ...value, endDraft: text }))} onChange={iso => update(row.id, value => ({ ...value, endDate: iso, endDraft: formatDateInput(iso) }))}/></div>
        </div>
        <div className="service-accounting-current"><button type="button" className="seniority-switch" role="switch" aria-checked={row.current} aria-labelledby={`service-period-${row.id}-current-label`} disabled={busy} onClick={() => update(row.id, value => ({ ...value, current: !value.current }))}><span aria-hidden="true"/></button><span id={`service-period-${row.id}-current-label`}>Поточний період служби</span></div>
      </fieldset>
    })}
    <div className="service-period-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={() => onChange([...rows, { id: createId(), startDate: '', startDraft: '', endDate: '', endDraft: '', current: false }])}><Plus size={16} aria-hidden="true"/><span>Додати період</span></button>
      <button type="button" className="secondary-button" disabled={busy || !hasHireDate || hasCurrent} onClick={addCurrentFromHire}><CalendarCheck size={16} aria-hidden="true"/><span>Додати поточний період від дати прийняття</span></button>
    </div>
  </div>
}
