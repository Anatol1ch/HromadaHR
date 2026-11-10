import DateField from '../DateField'

export default function ServiceLeaveDate({ value, disabled, error, onChange, onDraftChange }: {
  value: string; disabled: boolean; error: string
  onChange: (value: string) => void; onDraftChange: (display: string) => void
}) {
  return <div className="leave-service-date">
    <label className="recipient-field">Дата набуття права на додаткову відпустку за стаж
      <DateField value={value} onChange={onChange} onDraftChange={onDraftChange} disabled={disabled} error={error}/>
    </label>
  </div>
}
