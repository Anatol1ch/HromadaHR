import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
export default function HelpTip({ label, text, onClick, icon }: { label: string; text: string; onClick?: () => void; icon?: ReactNode }) {
  const id = useId()
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!position) return
    const close = () => setPosition(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [position])
  return <span className="leave-help"><button type="button" onClick={onClick} className={onClick ? 'leave-help-action' : undefined} aria-label={label} aria-describedby={position ? id : undefined}
    onMouseEnter={event => { const r = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top: Math.max(120, r.top) }) }}
    onFocus={event => { const r = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top: Math.max(120, r.top) }) }}
    onMouseLeave={() => setPosition(null)} onBlur={() => setPosition(null)}
    onKeyDown={event => { if (event.key === 'Escape' && position) { event.stopPropagation(); setPosition(null) } }}>
    {icon ?? <CircleHelp size={16} aria-hidden="true" />}</button>
    {position && createPortal(<span id={id} role="tooltip" className="leave-tooltip" style={{ left: position.left, top: position.top }}>{text}</span>, document.body)}
  </span>
}
