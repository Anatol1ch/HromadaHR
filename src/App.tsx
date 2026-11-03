import type { NavigationGuard } from './components/employees/useUnsavedChanges'
import EmployeesWorkspace from './components/employees/EmployeesWorkspace'
import { useEffect, useRef, useState } from 'react'
import { Activity, Award, CalendarDays, ChevronRight, CircleHelp, Code2, ArrowUpRight, FileText, Home, Settings, UsersRound } from 'lucide-react'
import Alert from './components/Alert'
import DataState from './components/DataState'
import communityCoat from '../assets/community-coat.png'
import type { StorageErrorCode, StorageStatus } from '../shared/ipc'
import SettingsPage from './components/SettingsPage'
import HelpDialog from './components/HelpDialog'
import EmployeeSummary from './components/EmployeeSummary'
import RecoveryScreen from './components/RecoveryScreen'

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

const sectionDescriptions: Record<Exclude<SectionId, 'home' | 'employees' | 'settings'>, string> = {
  overview: 'Тут буде зведений огляд кадрового обліку громади. Показники з’являться після реалізації кадрових модулів.',
  leave: 'Тут буде облік відпусток і їхніх залишків. Ведення та розрахунок відпусток ще не доступні.',
  service: 'Тут буде облік стажу та рангів працівників. Розрахунки й кадрові операції ще не доступні.',
  documents: 'Тут буде робота з кадровими документами. Створення та облік документів ще не доступні.',
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

function HomePage({ onEmployees }: { onEmployees: () => void }) {
  return <div className="workspace-page page-transition">
    <section className="page-heading workspace-heading" aria-labelledby="home-title">
      <div className="workspace-coat-area"><img className="community-coat" src={communityCoat} alt="Герб Вишнівської селищної територіальної громади" /></div>
      <div className="workspace-identity-copy">
        <div className="eyebrow">РОБОЧИЙ ПРОСТІР ГРОМАДИ</div>
        <h1 id="home-title"><span>Вишнівська селищна</span>{' '}<span>територіальна громада</span></h1>
        <p className="workspace-system-name">HromadaHR</p>
        <p className="subtitle">Автоматизована система кадрового обліку</p>
      </div>
    </section>
    <section className="dashboard-panel workspace-actions" aria-labelledby="workspace-title">
      <div className="workspace-primary"><div><h2 id="workspace-title">Кадрова робота</h2><p>Працівники, особові картки та історія призначень громади.</p></div>
        <button type="button" className="primary-button" onClick={onEmployees}><UsersRound size={19} aria-hidden="true"/>Відкрити реєстр працівників<ArrowUpRight size={17} aria-hidden="true"/></button>
      </div>
      <EmployeeSummary />
      <p className="workspace-next-modules">Відпустки, стаж, ранги й документи будуть доступні на наступних етапах.</p>
    </section>
    <footer className="page-footer"><p>© {new Date().getFullYear()} Вишнівська селищна рада. Внутрішня інформаційна система.</p><hr aria-hidden="true"/>
      <p className="home-footer-credit"><Code2 size={17} strokeWidth={1.7} aria-hidden="true"/><span>Developed by <strong>Anatolii Myronenko</strong></span></p>
    </footer>
  </div>
}

const storageErrors: Record<StorageErrorCode, string> = {
  CORRUPT: 'Виявлено пошкодження локального сховища. Дані не замінено. Потрібна технічна допомога.',
  UNSUPPORTED_SCHEMA: 'Версія або структура сховища не підтримується цим застосунком. Дані не змінено.',
  FILESYSTEM: 'Немає доступу до локального сховища. Перевірте доступ і вільне місце на диску.',
  BUSY: 'Локальне сховище зайняте. Закрийте інші програми, що можуть його використовувати, та перезапустіть застосунок.',
  MIGRATION_FAILED: 'Не вдалося оновити структуру сховища. Потрібна технічна допомога.',
  INITIALIZATION_FAILED: 'Не вдалося підготувати локальне сховище. Потрібна технічна допомога.',
  BACKUP_REQUIRED: 'Оновлення сховища потребує захисної копії. Ця версія застосунку не виконує таке оновлення.',
  RECOVERY_REQUIRED: 'Не вдалося завершити безпечне відновлення сховища. Потрібна технічна допомога; файли збережено.',
  MISSING_DATABASE: 'Файл раніше створеної бази відсутній. Нову порожню базу не створено.',
}

function StorageNotice() {
  const [status, setStatus] = useState<StorageStatus>({ state: 'initializing' })
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const result = await window.hromadaHR.storage.getStatus()
        if (active) setStatus(result.ok ? result.data : { state: 'error', code: 'INITIALIZATION_FAILED' })
      } catch {
        if (active) setStatus({ state: 'error', code: 'INITIALIZATION_FAILED' })
      }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  if (status.state === 'ready') return null
  return <Alert variant={status.state === 'error' ? 'error' : 'info'}>
    {status.state === 'error' ? storageErrors[status.code] :
      status.state === 'closed' ? 'Локальне сховище закрито.' : 'Перевірка локального сховища…'}
  </Alert>
}

export default function App() {
  const [active, setActive] = useState<SectionId>('home')
  const [helpOpen, setHelpOpen] = useState(false)
  const navigationGuard = useRef<NavigationGuard>(proceed => proceed())
  function navigate(id: SectionId) {
    if (id !== active) navigationGuard.current(() => setActive(id))
  }
  const [storage, setStorage] = useState<StorageStatus>({ state: 'initializing' })
  useEffect(() => {
    let alive = true, pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const result = await window.hromadaHR.storage.getStatus()
        if (alive) setStorage(result.ok ? result.data : { state: 'error', code: 'INITIALIZATION_FAILED' })
      } catch { if (alive) setStorage({ state: 'error', code: 'INITIALIZATION_FAILED' }) }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  const current = sections.find(section => section.id === active)!
  const CurrentIcon = current.icon

  if (storage.state !== 'ready') return <RecoveryScreen status={storage} />

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
          <NavigationItem key={section.id} section={section} active={active} onNavigate={navigate} />)}
      </nav>
      <div className="sidebar-bottom">
        <div className="nav-label">СИСТЕМА</div>
        <nav aria-label="Система">
          <NavigationItem section={sections[6]} active={active} onNavigate={navigate} />
        </nav>
        <button type="button" className="help-card help-card-button" aria-label="Потрібна допомога?" title="Потрібна допомога?" onClick={() => setHelpOpen(true)}><span className="help-icon"><CircleHelp size={18} aria-hidden="true"/></span><span className="help-copy"><strong>Потрібна допомога?</strong><span>Зверніться до адміністратора системи</span></span><ChevronRight size={17} aria-hidden="true"/></button>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="topbar-inner">
          <nav className="crumb" aria-label="Навігаційні крихти">
            <ol>
              <li>{active === 'home' ? <span>Робочий простір</span> :
                <button type="button" onClick={() => navigate('home')}>Робочий простір</button>}</li>
              <li><ChevronRight size={15} aria-hidden="true" /><span aria-current="page">{current.label}</span></li>
            </ol>
          </nav>
        </div>
      </header>
      <main id="workspace-content" tabIndex={-1} className="content home-content">
        <StorageNotice />
        {active === 'home' ? <HomePage onEmployees={() => navigate('employees')} /> : active === 'employees' ?
          <EmployeesWorkspace navigationGuard={navigationGuard} /> : active === 'settings' ? <SettingsPage /> :
          <div className="page-transition">
            <div className="page-heading">
              <div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>{current.label}</h1></div>
            </div>
            <section className="dashboard-panel" aria-label={`Стан розділу «${current.label}»`}>
              <DataState kind="planned" message="Функціональність ще не реалізована"
                description={sectionDescriptions[active]}
                icon={<CurrentIcon size={22} aria-hidden="true" />} />
            </section>
          </div>}
      </main>
    </div>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </div>
}
