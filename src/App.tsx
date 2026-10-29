import { useEffect, useState } from 'react'
import { Activity, Award, CalendarDays, ChevronRight, FileText, Home, Settings, UsersRound } from 'lucide-react'
import Alert from './components/Alert'
import DataState from './components/DataState'
import communityCoat from '../assets/community-coat.png'
import type { StorageErrorCode, StorageStatus } from '../shared/ipc'

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

const sectionDescriptions: Record<Exclude<SectionId, 'home'>, string> = {
  overview: 'Тут буде зведений огляд кадрового обліку громади. Показники з’являться після реалізації кадрових модулів.',
  employees: 'Тут буде облік працівників та їхніх особових карток. Ведення кадрових записів ще не доступне.',
  leave: 'Тут буде облік відпусток і їхніх залишків. Ведення та розрахунок відпусток ще не доступні.',
  service: 'Тут буде облік стажу та рангів працівників. Розрахунки й кадрові операції ще не доступні.',
  documents: 'Тут буде робота з кадровими документами. Створення та облік документів ще не доступні.',
  settings: 'Тут будуть налаштування установи й застосунку, зокрема назва громади та герб. Зміна параметрів ще не доступна.',
}

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

function HomePage() {
  return <div className="workspace-page">
    <section className="page-heading workspace-heading" aria-labelledby="home-title">
      <div className="workspace-mark-area"><img className="community-coat" src={communityCoat} alt="Герб Вишнівської селищної територіальної громади" /></div>
      <div className="workspace-identity-copy">
        <div className="eyebrow">РОБОЧИЙ ПРОСТІР ГРОМАДИ</div>
        <h1 id="home-title"><span>Вишнівська селищна</span>{' '}<span>територіальна громада</span></h1>
        <p className="workspace-system-name">HromadaHR</p>
        <p className="subtitle">Автоматизована система кадрового обліку</p>
      </div>
    </section>
    <section className="dashboard-panel" aria-labelledby="workspace-title">
      <div className="workspace-primary">
        <div>
          <h2 id="workspace-title">Ваш робочий простір</h2>
          <p>Єдине середовище для майбутньої роботи з кадровим обліком громади.</p>
        </div>
      </div>
      <div className="workspace-status">
        <Alert variant="info">
          <strong>Інтерфейсну оболонку створено</strong>
          <span>Доступна навігація між розділами. Їхня функціональність ще не реалізована.</span>
        </Alert>
        <p>Надалі тут можна буде вести особові картки працівників, облік відпусток, стажу, рангів і кадрових документів. Наразі розділи містять лише пояснення запланованих можливостей.</p>
      </div>
    </section>
    <footer className="page-footer"><p>HromadaHR · Автоматизована система кадрового обліку</p></footer>
  </div>
}

function ApplicationVersion() {
  const [version, setVersion] = useState('Завантаження версії…')
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await window.hromadaHR.system.getInfo()
        if (active) setVersion(result.ok ? `${result.data.name} · Версія ${result.data.version}` : 'Версія застосунку недоступна')
      } catch {
        if (active) setVersion('Версія застосунку недоступна')
      }
    }
    void load()
    return () => { active = false }
  }, [])
  return <footer className="page-footer"><p role="status">{version}</p></footer>
}

const storageErrors: Record<StorageErrorCode, string> = {
  CORRUPT: 'Виявлено пошкодження локального сховища. Дані не замінено. Потрібна технічна допомога.',
  UNSUPPORTED_SCHEMA: 'Версія або структура сховища не підтримується цим застосунком. Дані не змінено.',
  FILESYSTEM: 'Немає доступу до локального сховища. Перевірте доступ і вільне місце на диску.',
  BUSY: 'Локальне сховище зайняте. Закрийте інші програми, що можуть його використовувати, та перезапустіть застосунок.',
  MIGRATION_FAILED: 'Не вдалося оновити структуру сховища. Потрібна технічна допомога.',
  INITIALIZATION_FAILED: 'Не вдалося підготувати локальне сховище. Потрібна технічна допомога.',
  BACKUP_REQUIRED: 'Оновлення сховища потребує захисної копії. Ця версія застосунку не виконує таке оновлення.',
}

function StorageNotice({ showReady }: { showReady: boolean }) {
  const [status, setStatus] = useState<StorageStatus>({ state: 'initializing' })
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await window.hromadaHR.storage.getStatus()
        if (active) setStatus(result.ok ? result.data : { state: 'error', code: 'INITIALIZATION_FAILED' })
      } catch {
        if (active) setStatus({ state: 'error', code: 'INITIALIZATION_FAILED' })
      }
    })()
    return () => { active = false }
  }, [])
  if (status.state === 'ready') return showReady ? <Alert variant="info">
    Локальне сховище готове. Версія схеми: {status.schemaVersion}.
  </Alert> : null
  return <Alert variant={status.state === 'error' ? 'error' : 'info'}>
    {status.state === 'error' ? storageErrors[status.code] :
      status.state === 'closed' ? 'Локальне сховище закрито.' : 'Перевірка локального сховища…'}
  </Alert>
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
        <StorageNotice showReady={active === 'settings'} />
        {active === 'home' ? <HomePage /> :
          <div>
            <div className="page-heading">
              <div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>{current.label}</h1></div>
            </div>
            <section className="dashboard-panel" aria-label={`Стан розділу «${current.label}»`}>
              <DataState kind="planned" message="Функціональність ще не реалізована"
                description={sectionDescriptions[active]}
                icon={<CurrentIcon size={22} aria-hidden="true" />} />
            </section>
            {active === 'settings' && <ApplicationVersion />}
          </div>}
      </main>
    </div>
  </div>
}
