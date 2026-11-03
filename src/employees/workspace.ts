import type { Assignment, EmployeeCard } from '../../shared/personnel'

export type EmployeeFormTarget = { kind: 'create' } | { kind: 'edit'; employee: EmployeeCard } |
  { kind: 'assignment'; employee: EmployeeCard; assignment?: Assignment }
export interface EmployeeWorkspaceState {
  registry: { query: string; departmentId: string; descending: boolean }
  cardId: string | null
  form: EmployeeFormTarget | null
  action: { kind: 'edit' | 'delete'; id: string } | null
  revision: number
}
export const initialWorkspace: EmployeeWorkspaceState = { registry: { query: '', departmentId: '', descending: false }, cardId: null, form: null, action: null, revision: 0 }
export type WorkspaceAction =
  { type: 'registry'; registry: Partial<EmployeeWorkspaceState['registry']> } |
  { type: 'card'; id: string | null } | { type: 'form'; form: EmployeeFormTarget | null } |
  { type: 'action'; action: EmployeeWorkspaceState['action'] } |
  { type: 'saved'; employee: EmployeeCard; created: boolean } | { type: 'deleted'; id: string }
export function workspaceReducer(state: EmployeeWorkspaceState, action: WorkspaceAction): EmployeeWorkspaceState {
  switch (action.type) {
    case 'registry': return { ...state, registry: { ...state.registry, ...action.registry } }
    case 'card': return { ...state, cardId: action.id }
    case 'form': return { ...state, form: action.form }
    case 'action': return { ...state, action: action.action }
    case 'saved': return { ...state, form: null, action: null, cardId: action.created ? action.employee.id : state.cardId, revision: state.revision + 1 }
    case 'deleted': return { ...state, cardId: state.cardId === action.id ? null : state.cardId, action: null, revision: state.revision + 1 }
  }
}
export function mergeEmployee(rows: EmployeeCard[], saved: EmployeeCard) {
  return rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved]
}
