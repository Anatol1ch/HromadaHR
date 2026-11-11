import { useState, type RefObject } from 'react'
import type { Allowance, CurrentRank, SeniorityOverview } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import IndicatorEditor from './IndicatorEditor'
import { directionsFor, type Kind } from './model'

export default function IndicatorsCard({ row, navigationGuard, onClose, onSaved }: {
  row: SeniorityOverview; navigationGuard: RefObject<NavigationGuard>; onClose: () => void
  onSaved: (kind: Kind, value: Allowance | CurrentRank | null) => void
}) {
  const [active, setActive] = useState<Kind>(()=>directionsFor(row.employee.employeeType)[0])
  return <IndicatorEditor kind={active} row={row} navigationGuard={navigationGuard}
    onSwitch={setActive} onClose={onClose} onSaved={onSaved}/>
}
