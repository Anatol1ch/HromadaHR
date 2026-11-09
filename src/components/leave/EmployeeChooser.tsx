import { useRef, useState, type KeyboardEvent } from 'react'
import { Search, UserRound } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName } from '../../employees/model'
import SearchField from '../SearchField'
import { matchesEmployeeName } from './usage'

export default function EmployeeChooser({ employees, selected, loading, onSelect }: {
  employees: EmployeeCard[]; selected: string; loading: boolean
  onSelect: (id: string, accepted: () => void) => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const change = useRef<HTMLButtonElement>(null)
  const employee = employees.find(person => person.id === selected)
  const open = searching || !employee
  const results = employees.filter(person => matchesEmployeeName(fullName(person), query))
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setQuery('')
      if (employee) { setSearching(false); change.current?.focus() }
      else root.current?.querySelector<HTMLInputElement>('input')?.focus()
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-employee-result]') ?? [])]
    if (!buttons.length) return
    event.preventDefault()
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1)
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  return <div ref={root} className="dashboard-panel leave-employee-chooser" onKeyDown={keyboard}>
    {employee && <div className="leave-chosen-person"><span className="leave-type-icon"><UserRound size={20} aria-hidden="true" /></span>
      <div><strong>{fullName(employee)}</strong><small>{employee.position.name} · {employee.department.name}</small></div>
      <button ref={change} type="button" className="secondary-button leave-change-employee" aria-expanded={open} onClick={() => {
        setSearching(value => !value); setQuery('')
        if (!open) requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('input')?.focus())
      }}><Search size={16} aria-hidden="true"/>{open ? 'Закрити пошук' : 'Змінити працівника'}</button></div>}
    {open && <div className="leave-employee-search"><SearchField value={query} onChange={setQuery} label="Знайти працівника за ПІБ" placeholder="Знайти працівника за ПІБ" disabled={loading} />
      <div className="leave-employee-results" role="group" aria-label="Результати пошуку працівників">
        {results.map(person => <button data-employee-result type="button" key={person.id} aria-label={'Обрати: ' + fullName(person)} onClick={() => onSelect(person.id, () => {
          setSearching(false); setQuery(''); requestAnimationFrame(() => change.current?.focus())
        })}><strong>{fullName(person)}</strong><small>{person.position.name} · {person.department.name}</small></button>)}
        {!results.length && <p role="status">{loading ? 'Завантаження працівників…' : employees.length ? 'За цим ПІБ працівників не знайдено.' : 'Працівників ще немає. Додайте їх у кадровому реєстрі.'}</p>}
      </div></div>}
  </div>
}
