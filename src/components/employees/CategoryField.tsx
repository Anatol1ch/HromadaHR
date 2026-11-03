import Select from '../Select'
import { categoryOptions } from '../../employees/categories.ts'

export default function CategoryField({ value, onChange, disabled, error }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; error?: string
}) {
  return <div className="recipient-field employee-field"><span>Категорія посади</span>
    <Select label="Категорія посади" value={value} onChange={onChange} options={categoryOptions(value)} disabled={disabled} error={error} advanceOnSelect={false}/>
  </div>
}
