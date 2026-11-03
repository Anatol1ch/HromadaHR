// Adapted from HromadaAID 33eca10733caaf73b1a99e75a24ff35e706a0afb src/App.tsx.
import { CircleHelp, Mail, Phone, Send } from 'lucide-react'
import Modal from './Modal'

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="Допомога та підтримка" description="З питань роботи системи, технічних несправностей та налаштування звертайтеся до розробника й адміністратора HromadaHR."
    onClose={onClose} headerIcon={<CircleHelp size={19} aria-hidden="true"/>}>
    <div className="support-contact-card">
      <div className="support-contact-owner"><strong>Розробник та адміністратор системи</strong><span>Анатолій Мироненко</span></div>
      {[
        { label: 'Телефон', value: '+380 98 519 63 40', icon: Phone },
        { label: 'Робоча електронна пошта', value: 'tech.vishnsrada@ukr.net', icon: Mail },
        { label: 'Особиста електронна пошта', value: 'myronenko.anatoliu@gmail.com', icon: Mail },
        { label: 'Telegram', value: '@antlmrnnk', icon: Send },
      ].map(({ label, value, icon: Icon }) => <div className="support-contact-detail" key={label} tabIndex={0}>
        <Icon size={16} aria-hidden="true"/><span><small>{label}</small><strong>{value}</strong></span>
      </div>)}
    </div>
    <p className="support-contact-note">Контакти можна виділити й скопіювати. Під час звернення вкажіть версію HromadaHR із розділу «Про програму».</p>
  </Modal>
}
