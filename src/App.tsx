import { DocumentNavigationContext } from './components/documents/DocumentNavigationContext'
import { requestDocumentNavigation,type DocumentNavigationIntent } from './components/documents/navigation'
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
import { Activity, BookOpen, ChevronRight, CircleHelp, Code2, ArrowUpRight, FileText, Home, PanelLeftClose, PanelLeftOpen, Settings, UsersRound } from 'lucide-react'
import { getSidebarToggleLabel, isCompactSidebar, readCompactSidebar, writeCompactSidebar } from './lib/sidebar-preference'
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
    <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
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
    <nav className="workspace-shortcuts" aria-label="Основні розділи">
      {([
        { id: 'employees', title: 'Працівники', text: 'Реєстр та особові картки', icon: UsersRound },
        { id: 'documents', title: 'Документи', text: 'Кадрові документи та журнал відпусток', icon: FileText },
      ] as const).map(({ id, title, text, icon: Icon }) => <button type="button" key={id}
        aria-label={title} onClick={() => onNavigate(id)}>
        <span className="workspace-action-icon"><Icon size={23} aria-hidden="true"/></span><span><strong>{title}</strong><small>{text}</small></span><ArrowUpRight size={19} aria-hidden="true"/>
      </button>)}
    </nav>
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
  const [preferredCompact, setPreferredCompact] = useState(() => readCompactSidebar({ getItem: key => window.localStorage.getItem(key) }))
  const [narrowViewport, setNarrowViewport] = useState(() => window.matchMedia('(max-width: 1100px)').matches)
  const [documentIntent,setDocumentIntent]=useState<DocumentNavigationIntent>()
  const [employeeIntent,setEmployeeIntent]=useState<EmployeeNavigationIntent>()
  const [employeeProfileLabel,setEmployeeProfileLabel]=useState<string>()
  const [returnToEmployeeRegistry,setReturnToEmployeeRegistry]=useState(0)
  const intentSequence=useRef(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const navigationGuard = useRef<NavigationGuard>(proceed => proceed())
  function navigate(id: SectionId) {
    if (id === active) {
      if(id==='employees'&&employeeProfileLabel) navigationGuard.current(()=>setReturnToEmployeeRegistry(value=>value+1))
      return
    }
    navigationGuard.current(() => { setEmployeeIntent(undefined);setEmployeeProfileLabel(undefined);setActive(id);setDocumentIntent(undefined) })
  }
  const returnToRegistry=()=>navigationGuard.current(()=>setReturnToEmployeeRegistry(value=>value+1))
  const openDocument=(id:string,done:()=>void=()=>{})=>requestDocumentNavigation(id,++intentSequence.current,navigationGuard.current,intent=>{setDocumentIntent(intent);setEmployeeIntent(undefined);setEmployeeProfileLabel(undefined);setActive('documents')},done)
  const [startupReady, setStartupReady] = useState(false)
  const startedAt = useRef(Date.now())
  const [storage, setStorage] = useState<StorageStatus>({ state: 'initializing' })
  useEffect(() => { writeCompactSidebar({ setItem: (key, value) => window.localStorage.setItem(key, value) }, preferredCompact) }, [preferredCompact])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const update = () => setNarrowViewport(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const control=usePersonnelControl(startupReady&&storage.state==='ready')
  useEffect(()=>{if(active==='overview')void control.refresh()},[active,control.refresh])
  const openControlEmployee=(issue:PersonnelIssue,done:()=>void=()=>{})=>requestEmployeeNavigation(issue,++intentSequence.current,navigationGuard.current,intent=>{setEmployeeProfileLabel(undefined);setEmployeeIntent(intent);setActive('employees')},done)
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
  const compactSidebar = isCompactSidebar(narrowViewport, preferredCompact)
  const sidebarToggleLabel = getSidebarToggleLabel(preferredCompact, narrowViewport)

  if (storage.state === 'error' || storage.state === 'closed') return <RecoveryScreen status={storage} />
  if (!startupReady) return <StartupScreen />
  if (storage.state !== 'ready') return <RecoveryScreen status={storage} />

  return <div className={`app-shell${compactSidebar ? ' sidebar-compact' : ''}`}>
    <a className="skip-link" href="#workspace-content">Перейти до вмісту</a>
    <aside className="sidebar" aria-label="Бічна панель HromadaHR">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-mark" title="HromadaHR"><UsersRound size={22} strokeWidth={2.1} aria-hidden="true" /></div>
          <div className="brand-copy">
            <div className="brand-name">Hromada<span>HR</span></div>
          </div>
        </div>
      </div>
      <nav className="nav-list" aria-label="Робочий простір">
        {sections.filter(section => section.id !== 'settings').map(section =>
          <NavigationItem key={section.id} section={section} active={active} onNavigate={navigate} />)}
      </nav>
      <div className="sidebar-spacer" aria-hidden="true" />
      <div className="sidebar-bottom">
        <button type="button" className="nav-item" aria-label="Допомога та підтримка"
          title="Допомога та підтримка" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={20} strokeWidth={1.8} aria-hidden="true"/><span>Допомога та підтримка</span>
        </button>
        <nav className="sidebar-system-nav" aria-label="Системні налаштування">
          <NavigationItem section={settingsSection} active={active} onNavigate={navigate} />
        </nav>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className={`topbar-inner${active === 'employees' || active === 'documents' ? ' topbar-inner-workspace' : ''}`}>
          <button type="button" className="secondary-button sidebar-toggle topbar-sidebar-toggle" aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel} aria-pressed={preferredCompact}
            onClick={() => setPreferredCompact(value => !value)}>
            {preferredCompact ? <PanelLeftOpen size={20} aria-hidden="true"/> : <PanelLeftClose size={20} aria-hidden="true"/>}
          </button>
          <nav className="crumb" aria-label="Навігаційні крихти">
            <ol>
              <li>{active === 'home' ? <span>Робочий простір</span> :
                <button type="button" onClick={() => navigate('home')}>Робочий простір</button>}</li>
              {active==='employees'&&employeeProfileLabel?<>
                <li><ChevronRight size={15} aria-hidden="true"/><button type="button" onClick={returnToRegistry}>Працівники</button></li>
                <li className="crumb-profile-current"><ChevronRight size={15} aria-hidden="true"/><span aria-current="page" title={employeeProfileLabel}>Особова картка ({employeeProfileLabel})</span></li>
              </>:<li><ChevronRight size={15} aria-hidden="true" /><span aria-current="page">{current.label}</span></li>}
            </ol>
          </nav>
          <PersonnelControlBell model={control} onOpen={openControlEmployee} onOverview={done=>navigationGuard.current(()=>{done();setEmployeeProfileLabel(undefined);setActive('overview');void control.refresh()})}/>
        </div>
      </header>
      <DocumentNavigationContext.Provider value={openDocument}><main id="workspace-content" tabIndex={-1}
        className={`content home-content${active === 'employees' || active === 'documents' ? ' content-workspace' : ''}`}>
        <StorageNotice />
        {active === 'home' ? <HomePage onNavigate={navigate} /> : active === 'employees' ?
          <EmployeesWorkspace initialIntent={employeeIntent} onIntentHandled={()=>setEmployeeIntent(undefined)} navigationGuard={navigationGuard}
            profileReturnRequest={returnToEmployeeRegistry} onProfileContextChange={setEmployeeProfileLabel} onReturnToRegistry={returnToRegistry}/> : active === 'documents' ?
          <DocumentsWorkspace initialIntent={documentIntent} navigationGuard={navigationGuard} /> : active === 'settings' ? <SettingsPage navigationGuard={navigationGuard}/> :
          active==='overview'?<PersonnelControlOverview model={control} onOpen={openControlEmployee} navigationGuard={navigationGuard}/>:
          <DictionariesWorkspace navigationGuard={navigationGuard}/>}
      </main></DocumentNavigationContext.Provider>
    </div>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </div>
}
