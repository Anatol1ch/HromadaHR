import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, normalizeText } from '../../employees/model.ts'
import { employeeStructure, withDirectoryNames, type DirectoryOrder } from '../../employees/registry.ts'
import type { SelectOption } from '../Select'

export function employeePickerOptions(employees: EmployeeCard[], directories: DirectoryOrder): SelectOption[] | null {
  const groups = employeeStructure(withDirectoryNames(employees, directories), directories)
  return groups?.flatMap(group => group.rows.map(person => ({
    value: person.id,
    label: fullName(person),
    description: `${person.position.name} · ${person.department.name}`,
  }))) ?? null
}

export function matchesEmployeeOption(option: SelectOption, query: string) {
  const text = normalizeText(`${option.label} ${option.description ?? ''}`)
  return normalizeText(query).split(' ').every(term => text.includes(term))
}
