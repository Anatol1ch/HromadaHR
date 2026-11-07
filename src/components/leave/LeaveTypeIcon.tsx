import { Sun, Landmark, Baby, GraduationCap, ShieldCheck, Ribbon } from 'lucide-react'
import type { LeaveType } from '../../../shared/leave'

const icons = { annual_main: Sun, oms_service_additional: Landmark, children_social_additional: Baby,
  study_leave: GraduationCap, veteran_special_leave: ShieldCheck, chernobyl_special_leave: Ribbon }

export default function LeaveTypeIcon({ type }: { type: LeaveType }) {
  const Icon = icons[type]
  return <span className="leave-type-icon"><Icon size={18} aria-hidden="true" /></span>
}
