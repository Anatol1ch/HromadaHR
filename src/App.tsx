import { useState } from 'react'
import { Activity, ArrowUpRight, Award, CalendarDays, ChevronRight, FileText, Home, Settings, UsersRound } from 'lucide-react'
import Alert from './components/Alert'
import DataState from './components/DataState'
import communityCoat from '../assets/community-coat.png'

const sections = [
  { id: 'home', label: 'Головна', icon: Home },
  { id: 'overview', label: 'Огляд', icon: Activity },
  { id: 'employees', label: 'Працівники', icon: UsersRound },
  { id: 'leave', label: 'Відпустки', icon: CalendarDays },
  { id: 'service', label: 'Стаж і ранги', icon: Award },
  { id: 'documents', label: 'Документи', icon: FileText },
  { id: 'settings', label: 'Налаштування', icon: Settings },
] as const

type SectionId = typeof sections[number]['id']
type Section = typeof sections[number]

function NavigationItem({ section, active, onNavigate }: {
  section: Section
  active: SectionId
  onNavigate: (id: SectionId) => void
}) {
  const Icon = section.icon
  return <button type="button" className={`nav-item${active === section.id ? ' active' : ''}`}
    aria-label={section.label} title={section.label}
    aria-current={active === section.id ? 'page' : undefined}
    onClick={() => onNavigate(section.id)}>
    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
    <span>{section.label}</span>
  </button>
}

function HomePage({ onNavigate }: { onNavigate: (id: SectionId) => void }) {
  return <div className="workspace-page">
    <section className="page-heading workspace-heading" aria-labelledby="home-title">
      <div className="workspace-mark-area"><img className="community-coat" src={communityCoat} alt="Герб Вишнівської селищної територіальної громади" /></div>
      <div className="workspace-identity-copy">
        <div className="eyebrow">РОБОЧИЙ ПРОСТІР ГРОМАДИ</div>
        <h1 id="home-title">Система кадрового обліку</h1>
        <p className="workspace-system-name">HromadaHR</p>
        <p className="subtitle">Автоматизована система кадрового обліку для органів місцевого самоврядування України.</p>
      </div>
    </section>
    <section className="dashboard-panel" aria-labelledby="workspace-title">
      <div className="workspace-primary">
        <div>
          <h2 id="workspace-title">Ваш робочий простір</h2>
          <p>Єдине середовище для майбутньої роботи з кадровим обліком громади.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate('overview')}>
          Перейти до огляду<ArrowUpRight size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="workspace-status">
        <Alert variant="info">
          <strong>Інтерфейсну оболонку створено</strong>
          <span>Доступна навігація між розділами. Їхня функціональність ще не реалізована.</span>
        </Alert>
        <p>Оберіть розділ на бічній панелі, щоб переглянути його поточний стан.</p>
      </div>
    </section>
    <footer className="page-footer"><p>HromadaHR · Автоматизована система кадрового обліку</p></footer>
  </div>
}

export default function App() {
  const [active, setActive] = useState<SectionId>('home')
  const current = sections.find(section => section.id === active)!
  const CurrentIcon = current.icon

  return <div className="app-shell">
    <a className="skip-link" href="#workspace-content">Перейти до вмісту</a>
    <aside className="sidebar" aria-label="Бічна панель HromadaHR">
      <div className="brand">
        <div className="brand-mark" title="HromadaHR"><UsersRound size={22} strokeWidth={2.1} aria-hidden="true" /></div>
        <div className="brand-copy">
          <div className="brand-name">Hromada<span>HR</span></div>
          <div className="brand-caption">Автоматизована система кадрового обліку</div>
        </div>
      </div>
      <div className="nav-label">РОБОЧИЙ ПРОСТІР</div>
      <nav className="nav-list" aria-label="Робочий простір">
        {sections.filter(section => section.id !== 'settings').map(section =>
          <NavigationItem key={section.id} section={section} active={active} onNavigate={setActive} />)}
      </nav>
      <div className="sidebar-bottom">
        <div className="nav-label">СИСТЕМА</div>
        <nav aria-label="Система">
          <NavigationItem section={sections[6]} active={active} onNavigate={setActive} />
        </nav>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="topbar-inner">
          <nav className="crumb" aria-label="Навігаційні крихти">
            <ol>
              <li>{active === 'home' ? <span>Робочий простір</span> :
                <button type="button" onClick={() => setActive('home')}>Робочий простір</button>}</li>
              <li><ChevronRight size={15} aria-hidden="true" /><span aria-current="page">{current.label}</span></li>
            </ol>
          </nav>
        </div>
      </header>
      <main id="workspace-content" tabIndex={-1} className="content home-content">
        {active === 'home' ? <HomePage onNavigate={setActive} /> :
          <div>
            <div className="page-heading">
              <div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>{current.label}</h1></div>
            </div>
            <section className="dashboard-panel" aria-label={`Стан розділу «${current.label}»`}>
              <DataState kind="planned" message="Функціональність ще не реалізована"
                description={`Розділ «${current.label}» буде доступний на наступних етапах розробки.`}
                icon={<CurrentIcon size={22} aria-hidden="true" />} />
            </section>
          </div>}
      </main>
    </div>
  </div>
}
