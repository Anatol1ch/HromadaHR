import PersonnelControlOverview from './components/personnel-control/PersonnelControlOverview'
import PersonnelControlBell from './components/personnel-control/PersonnelControlBell'
import usePersonnelControl from './components/personnel-control/usePersonnelControl'
import { requestEmployeeNavigation } from './employees/navigation'
import type { PersonnelIssue,EmployeeNavigationIntent } from '../shared/personnel-control'
import StartupScreen from './components/StartupScreen'
import { STARTUP_MINIMUM_MS, waitForStartupGate } from './lib/startup-timing'
import type { NavigationGuard } from './components/employees/useUnsavedChanges'
import EmployeesWorkspace from './components/employees/EmployeesWorkspace'
import DictionariesWorkspace from './components/employees/DictionariesWorkspace'
import DocumentsWorkspace from './components/documents/DocumentsWorkspace'
import { useEffect, useRef, useState } from 'react'
import { Activity, BookOpen, ChevronRight, CircleHelp, Code2, ArrowUpRight, FileText, Home, Settings, UsersRound } from 'lucide-react'
import Alert from './components/Alert'
import communityCoat from '../assets/community-coat.png'
import type { StorageErrorCode, StorageStatus } from '../shared/ipc'
import SettingsPage from './components/SettingsPage'
import HelpDialog from './components/HelpDialog'
import RecoveryScreen from './components/RecoveryScreen'

const sections = [
  { id: 'home', label: 'Головна', icon: Home },
  { id: 'overview', label: 'Огляд', icon: Activity },
  { id: 'employees', label: 'Працівники', icon: UsersRound },
  { id: 'documents', label: 'Документи', icon: FileText },
  { id: 'dictionaries', label: 'Довідники', icon: BookOpen },
  { id: 'settings', label: 'Налаштування', icon: Settings },
] as const

type SectionId = typeof sections[number]['id']
type Section = typeof sections[number]

const settingsSection = sections.find(section => section.id === 'settings')!
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
      <div className="workspace-primary"><div><h2 id="workspace-title">Щоденна робота</h2><p>Оберіть розділ для роботи.</p></div></div>
      <div className="workspace-shortcuts">{([
        { id: 'employees', title: 'Працівники', text: 'Реєстр та особові картки', icon: UsersRound },
        { id: 'documents', title: 'Документи', text: 'Журнал відпусток', icon: FileText },
      ] as const).map(({ id, title, text, icon: Icon }) => <button type="button" key={id}
        aria-label={title} onClick={() => onNavigate(id)}>
        <span className="workspace-action-icon"><Icon size={20} aria-hidden="true"/></span><span><strong>{title}</strong><small>{text}</small></span><ArrowUpRight size={18} aria-hidden="true"/>
      </button>)}</div>
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
  const [employeeIntent,setEmployeeIntent]=useState<EmployeeNavigationIntent>()
  const intentSequence=useRef(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const navigationGuard = useRef<NavigationGuard>(proceed => proceed())
  function navigate(id: SectionId) {
    if (id !== active) navigationGuard.current(() => { setEmployeeIntent(undefined);setActive(id) })
  }
  const [startupReady, setStartupReady] = useState(false)
  const startedAt = useRef(Date.now())
  const [storage, setStorage] = useState<StorageStatus>({ state: 'initializing' })
  const control=usePersonnelControl(startupReady&&storage.state==='ready')
  useEffect(()=>{if(active==='overview')void control.refresh()},[active,control.refresh])
  const openControlEmployee=(issue:PersonnelIssue,done:()=>void=()=>{})=>requestEmployeeNavigation(issue,++intentSequence.current,navigationGuard.current,intent=>{setEmployeeIntent(intent);setActive('employees')},done)
  useEffect(() => {
    let alive = true, pending = false, settled = false
    const accept = (status: StorageStatus) => {
      if (!alive) return
      setStorage(status)
      if (!settled && status.state !== 'initializing') {
        settled = true
        void waitForStartupGate(startedAt.current, STARTUP_MINIMUM_MS, async () => status, Date.now, undefined, value => value.state !== 'ready')
          .then(() => { if (alive) setStartupReady(true) })
      }
    }
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const result = await window.hromadaHR.storage.getStatus()
        accept(result.ok ? result.data : { state: 'error', code: 'INITIALIZATION_FAILED' })
      } catch { accept({ state: 'error', code: 'INITIALIZATION_FAILED' }) }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  const current = sections.find(section => section.id === active)!

  if (storage.state === 'error' || storage.state === 'closed') return <RecoveryScreen status={storage} />
  if (!startupReady) return <StartupScreen />
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
        <button type="button" className="help-card help-card-button" aria-label="Потрібна допомога?" title="Потрібна допомога?" onClick={() => setHelpOpen(true)}><span className="help-icon"><CircleHelp size={18} aria-hidden="true"/></span><span className="help-copy"><strong>Потрібна допомога?</strong><span>Зверніться до адміністратора системи</span></span><ChevronRight size={17} aria-hidden="true"/></button>
        <div className="nav-label">СИСТЕМА</div>
        <nav aria-label="Система">
          <NavigationItem section={settingsSection} active={active} onNavigate={navigate} />
        </nav>
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
          <PersonnelControlBell model={control} onOpen={openControlEmployee} onOverview={done=>navigationGuard.current(()=>{done();setActive('overview');void control.refresh()})}/>
        </div>
      </header>
      <main id="workspace-content" tabIndex={-1} className="content home-content">
        <StorageNotice />
        {active === 'home' ? <HomePage onNavigate={navigate} /> : active === 'employees' ?
          <EmployeesWorkspace initialIntent={employeeIntent} onIntentHandled={()=>setEmployeeIntent(undefined)} navigationGuard={navigationGuard} /> : active === 'documents' ?
          <DocumentsWorkspace navigationGuard={navigationGuard} /> : active === 'settings' ? <SettingsPage navigationGuard={navigationGuard}/> :
          active==='overview'?<PersonnelControlOverview model={control} onOpen={openControlEmployee} navigationGuard={navigationGuard}/>:
          <DictionariesWorkspace navigationGuard={navigationGuard}/>}
      </main>
    </div>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </div>
}
