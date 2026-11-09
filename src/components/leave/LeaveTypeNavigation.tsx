import { ChevronDown } from 'lucide-react'
import { eventLeaveTypes, periodLeaveTypes, type LeaveType } from '../../../shared/leave'
import { leaveLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

const groups = [
  { title: 'Залишки за періодами', types: periodLeaveTypes },
  { title: 'Використання за рік', types: eventLeaveTypes },
] as const

export default function LeaveTypeNavigation({ value, onChange }: { value: LeaveType; onChange: (type: LeaveType) => void }) {
  return <nav className="leave-type-nav" aria-label="Види відпусток">
    {groups.map(({ title, types }) => <div className="leave-type-group" key={title} role="group" aria-label={title}>
      <h3>{title}</h3>
      {types.map(type => <button type="button" key={type} aria-pressed={value === type} onClick={() => onChange(type)}>
        <LeaveTypeIcon type={type}/><span>{leaveLabels[type]}</span>
      </button>)}
    </div>)}
    <label className="leave-type-picker">
      <span>Вид відпустки</span>
      <span className="leave-type-picker-control">
        <span aria-hidden="true">{leaveLabels[value]}</span><ChevronDown size={17} aria-hidden="true"/>
        <select value={value} onChange={event => onChange(event.target.value as LeaveType)}>
          {groups.map(({ title, types }) => <optgroup key={title} label={title}>
            {types.map(type => <option key={type} value={type}>{leaveLabels[type]}</option>)}
          </optgroup>)}
        </select>
      </span>
    </label>
  </nav>
}
