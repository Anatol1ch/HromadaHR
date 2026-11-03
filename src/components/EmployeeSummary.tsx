import { useEffect, useState } from 'react'
import { employeeCounts } from '../employees/registry.ts'
import { personnelMessage } from '../employees/model'
import Alert from './Alert'
import { ContentSkeleton } from './Skeleton'

export default function EmployeeSummary() {
  const [counts, setCounts] = useState<ReturnType<typeof employeeCounts> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void window.hromadaHR.personnel.listEmployees().then(result => {
      if (!alive) return
      if (result.ok) setCounts(employeeCounts(result.data))
      else setError(personnelMessage(result.error.code))
    }).catch(() => { if (alive) setError('Не вдалося завантажити кількість працівників.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [retry])
  if (loading) return <ContentSkeleton label="Завантаження кадрових даних…"/>
  if (error || !counts) return <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{error || 'Кадрові дані недоступні.'}</Alert>
  return <div className="employee-summary" aria-label="Огляд працівників">
    <dl>{[
      ['Усього працівників', counts.total],
      ['Посадових осіб місцевого самоврядування', counts.official],
      ['Інших працівників', counts.staff],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {counts.total === 0 && <p className="employee-hint">Працівників ще немає. Додайте перший запис у реєстрі.</p>}
  </div>
}
