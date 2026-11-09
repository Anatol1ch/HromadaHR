import { ChevronDown } from 'lucide-react'
import { periodLeaveTypes, type PeriodLeaveType } from '../../../shared/leave'
import { leaveLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export default function LeaveTypeNavigation({ value, onChange }: { value: PeriodLeaveType; onChange: (type: PeriodLeaveType) => void }) {
  return <nav className="leave-type-nav" aria-label="Види відпусток">
    <div className="leave-type-group">
      <h3>Залишки за періодами</h3>
      {periodLeaveTypes.map(type => <button type="button" key={type} aria-pressed={value === type} onClick={() => onChange(type)}>
        <LeaveTypeIcon type={type}/><span>{leaveLabels[type]}</span>
      </button>)}
    </div>
    <label className="leave-type-picker">
      <span>Вид відпустки</span>
      <span className="leave-type-picker-control">
        <span aria-hidden="true">{leaveLabels[value]}</span><ChevronDown size={17} aria-hidden="true"/>
        <select value={value} onChange={event => onChange(event.target.value as PeriodLeaveType)}>
          {periodLeaveTypes.map(type => <option key={type} value={type}>{leaveLabels[type]}</option>)}
        </select>
      </span>
    </label>
  </nav>
}
