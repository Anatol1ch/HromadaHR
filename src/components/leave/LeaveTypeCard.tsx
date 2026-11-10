import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

export default function LeaveTypeCard({ label, className, onOpen, children }: {
  label: string; className: string; onOpen: () => void; children: ReactNode
}) {
  return <article className={`info-item leave-type-card ${className}`}>
    {children}
    <button type="button" className="leave-type-card-trigger" aria-label={'Детальніше: ' + label} onClick={onOpen}>
      <ArrowRight size={16} aria-hidden="true"/>
    </button>
  </article>
}
