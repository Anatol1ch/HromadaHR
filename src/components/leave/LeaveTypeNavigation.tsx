import { ChevronDown, LayoutGrid } from 'lucide-react'
import { eventLeaveTypes, periodLeaveTypes, type LeaveType } from '../../../shared/leave'
import { leaveLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export type AccountingView = 'overview' | LeaveType
const labels = { ...leaveLabels, overview: 'Усі види відпусток' }
const groups = [
  { label: 'Огляд', types: ['overview'] },
  { label: 'Залишки за періодами', types: periodLeaveTypes },
  { label: 'Облік надань за рік', types: eventLeaveTypes },
] as const

export default function LeaveTypeNavigation({ value, onChange }: { value: AccountingView; onChange: (type: AccountingView) => void }) {
  return <nav className="leave-type-nav" aria-label="Види відпусток">
    {groups.map(group => <div className="leave-type-group" key={group.label}>
      <h3>{group.label}</h3>
      {group.types.map(type => <button type="button" key={type} aria-pressed={value === type} onClick={() => onChange(type)}>
        {type === 'overview' ? <LayoutGrid size={18} aria-hidden="true"/> : <LeaveTypeIcon type={type}/>}
        <span>{labels[type]}</span>
      </button>)}
    </div>)}
    <label className="leave-type-picker">
      <span>Вид відпустки</span>
      <span className="leave-type-picker-control">
        <span aria-hidden="true">{labels[value]}</span><ChevronDown size={17} aria-hidden="true"/>
        <select value={value} onChange={event => onChange(event.target.value as AccountingView)}>
          {groups.map(group => <optgroup key={group.label} label={group.label}>
            {group.types.map(type => <option key={type} value={type}>{labels[type]}</option>)}
          </optgroup>)}
        </select>
      </span>
    </label>
  </nav>
}
