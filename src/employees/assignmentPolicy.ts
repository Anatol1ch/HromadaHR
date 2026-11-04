import type { Assignment } from '../../shared/personnel'

/** No category editor: preserve corrections exactly; inherit only within the same position.
 * For a new earliest record the first known state is the conservative baseline.
 */
export function categoryForAssignment(positionId: string, startDate: string, history: Assignment[], editing?: Assignment): string | null {
  if (editing) return editing.category
  const ordered = [...history].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const baseline = ordered.filter(row => row.startDate <= startDate).at(-1) ?? ordered[0]
  return baseline?.positionId === positionId ? baseline.category : null
}
