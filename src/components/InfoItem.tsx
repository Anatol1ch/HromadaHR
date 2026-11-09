import type { ReactNode } from 'react'

/** A term and description, wrapped as one item inside a definition list. */
export default function InfoItem({ label, value, detail, emphasis = false, wide = false }: {
  label: string
  value: ReactNode
  detail?: ReactNode
  emphasis?: boolean
  wide?: boolean
}) {
  return <div className={`info-item${emphasis ? ' info-item-emphasis' : ''}${wide ? ' info-item-wide' : ''}`}>
    <dt>{label}</dt>
    <dd>{value}{detail != null && <small className="info-item-detail">{detail}</small>}</dd>
  </div>
}
