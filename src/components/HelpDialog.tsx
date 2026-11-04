// Adapted from HromadaAID 33eca10733caaf73b1a99e75a24ff35e706a0afb src/App.tsx.
import { CircleHelp, Mail, Phone, Send } from 'lucide-react'
import Modal from './Modal'
import { useRef, useState } from 'react'
import Alert from './Alert'
import type { ContactId } from '../../shared/contacts'

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  async function open(id: ContactId) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await window.hromadaHR.system.openContact(id)
      if (!result.ok || !result.data) setError('Не вдалося відкрити контакт. Перевірте системний застосунок або скопіюйте контакт нижче.')
    } catch { setError('Не вдалося відкрити контакт. Скопіюйте контакт нижче.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setError('') }
    catch { setError('Не вдалося скопіювати автоматично. Виділіть текст контакту та натисніть Ctrl+C.') }
  }
  return <Modal title="Допомога та підтримка" description="З питань роботи системи, технічних несправностей та налаштування звертайтеся до розробника й адміністратора HromadaHR."
    onClose={onClose} headerIcon={<CircleHelp size={19} aria-hidden="true"/>}>
    {error && <Alert variant="error">{error}</Alert>}
    <div className="support-contact-card">
      <div className="support-contact-owner"><strong>Розробник та адміністратор системи</strong><span>Анатолій Мироненко</span></div>
      {[
        { id: 'phone', label: 'Телефон', value: '+380 98 519 63 40', icon: Phone },
        { id: 'workEmail', label: 'Робоча електронна пошта', value: 'tech.vishnsrada@ukr.net', icon: Mail },
        { id: 'personalEmail', label: 'Особиста електронна пошта', value: 'myronenko.anatoliu@gmail.com', icon: Mail },
        { id: 'telegram', label: 'Telegram', value: '@antlmrnnk', icon: Send },
      ].map(({ id, label, value, icon: Icon }) => <div className="support-contact-row" key={id}>
        <button type="button" className="support-contact-detail" disabled={busy} aria-label={`Відкрити: ${label}`} onClick={() => void open(id as ContactId)}>
          <Icon size={16} aria-hidden="true"/><span><small>{label}</small><strong>{value}</strong></span>
        </button>
        <button type="button" className="secondary-button" aria-label={`Скопіювати: ${label}`} onClick={() => void copy(id === 'telegram' ? 'https://t.me/antlmrnnk' : value)}>Скопіювати</button>
      </div>)}
    </div>
    <p className="support-contact-note">Контакти можна виділити й скопіювати. Під час звернення вкажіть версію HromadaHR із розділу «Про програму».</p>
  </Modal>
}
