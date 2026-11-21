import { useId, type ReactNode } from 'react'

export default function InfoSection({ title, icon, action, help, children, className = '' }: {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  help?: ReactNode
  children: ReactNode
  className?: string
}) {
  const heading = useId()
  return <section className={`info-section${className ? ` ${className}` : ''}`} aria-labelledby={heading}>
    <header className="info-section-heading">
      {icon && <span className="info-section-icon" aria-hidden="true">{icon}</span>}
      <h3 id={heading}>{title}</h3>
      {help}
      {action && <div className="info-section-action">{action}</div>}
    </header>
    {children}
  </section>
}
