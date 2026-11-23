import type { EmployeeCard } from '../../../shared/personnel'
import type { LeaveType } from '../../../shared/leave'
import { useState, type RefObject } from 'react'
import { fullName } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Modal from '../Modal'
import LeaveRights from './LeaveRights'
import LeaveTypeIcon from './LeaveTypeIcon'
import { leaveWorkspaceLabels } from './presentation'

export default function LeaveRightModal({ employee, type, navigationGuard, onClose, onSaved }: {
  employee: EmployeeCard
  type: LeaveType
  navigationGuard: RefObject<NavigationGuard>
  onClose: () => void
  onSaved: () => void
}) {
  const [dirty, setDirty] = useState(false)
  return <Modal title="Право на відпустку" description={leaveWorkspaceLabels[type] + ' · ' + fullName(employee)}
    size="compact" className="leave-right-modal leave-editor-modal" headerIcon={<LeaveTypeIcon type={type}/>} dirty={dirty}
    onClose={onClose}>
    <LeaveRights key={type} employeeId={employee.id} navigationGuard={navigationGuard} type={type} onSaved={onSaved} onDirtyChange={setDirty}/>
  </Modal>
}
