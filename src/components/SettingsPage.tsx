// Adapted from HromadaAID 33eca10733caaf73b1a99e75a24ff35e706a0afb src/SettingsPage.tsx.
import { Code2, HardDrive, Info, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Select from './Select'
import { zoomPercents } from '../../shared/zoom'
import type { ZoomPercent, ZoomStatus } from '../../shared/zoom'
import hromadaHRLogo from '../../assets/hromadahr.svg?no-inline'
import BackupSettings from './BackupSettings'

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<'backup' | 'about'>('backup')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [zoom, setZoom] = useState<ZoomStatus | null>(null)
  const [zoomError, setZoomError] = useState('')
  const [changingZoom, setChangingZoom] = useState(false)
  const zoomInFlight = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    let active = true, pending = false
    async function refreshZoom() {
      if (pending || zoomInFlight.current) return
      pending = true
      try {
        const result = await window.hromadaHR.system.getZoom()
        if (active && !zoomInFlight.current) {
          if (result.ok) { setZoom(result.data); setZoomError('') }
          else setZoomError('Не вдалося отримати масштаб інтерфейсу.')
        }
      } catch { if (active) setZoomError('Не вдалося отримати масштаб інтерфейсу.') }
      finally { pending = false }
    }
    void refreshZoom()
    const timer = setInterval(() => { void refreshZoom() }, 1000)
    window.addEventListener('resize', refreshZoom)
    window.addEventListener('focus', refreshZoom)
    return () => {
      active = false; mounted.current = false; clearInterval(timer)
      window.removeEventListener('resize', refreshZoom)
      window.removeEventListener('focus', refreshZoom)
    }
  }, [])
  async function changeZoom(value: string) {
    if (zoomInFlight.current) return
    zoomInFlight.current = true; setChangingZoom(true); setZoomError('')
    try {
      const result = await window.hromadaHR.system.setZoom(Number(value) as ZoomPercent)
      if (mounted.current) {
        if (result.ok) setZoom(result.data)
        else setZoomError('Не вдалося змінити масштаб інтерфейсу.')
      }
    } catch { if (mounted.current) setZoomError('Не вдалося змінити масштаб інтерфейсу.') }
    finally { zoomInFlight.current = false; if (mounted.current) setChangingZoom(false) }
  }
  useEffect(() => {
    let active = true
    void window.hromadaHR.system.getInfo().then(result => {
      if (active) setAppVersion(result.ok ? result.data.version : null)
    }).catch(() => { if (active) setAppVersion(null) })
    return () => { active = false }
  }, [])
  return <div className="settings-page">
    <header className="page-heading settings-heading"><div><div className="eyebrow">СИСТЕМА</div><h1>Налаштування</h1><p className="subtitle">Параметри застосунку та інформація про програму.</p></div>
      <div className="settings-zoom"><span>Масштаб інтерфейсу</span>
        <Select label="Масштаб інтерфейсу" value={zoom ? String(zoom.percent) : ''} placeholder="Завантаження…"
          disabled={!zoom || changingZoom} advanceOnSelect={false} onChange={value => { void changeZoom(value) }}
          options={zoomPercents.map(percent => ({ value: String(percent), label: percent + '%' }))}/>
        {(zoomError || zoom?.saved === false) && <p className="field-error" role="alert">{zoomError || 'Не вдалося прочитати або зберегти масштаб. Після перезапуску він може змінитися.'}</p>}
      </div>
    </header>
    <nav className="settings-section-nav" aria-label="Розділи налаштувань">
      <button type="button" className={`settings-section-current${activeSection === 'backup' ? ' is-selected' : ''}`} aria-current={activeSection === 'backup' ? 'page' : undefined} onClick={() => setActiveSection('backup')}><HardDrive size={17} aria-hidden="true"/>Резервне копіювання</button>
      <button type="button" className={`settings-section-current${activeSection === 'about' ? ' is-selected' : ''}`} aria-current={activeSection === 'about' ? 'page' : undefined} onClick={() => setActiveSection('about')}><Info size={16} aria-hidden="true"/><span>Про програму</span></button>
    </nav>
    <div hidden={activeSection !== 'backup'}><BackupSettings /></div>
    {activeSection === 'about' && <div className="settings-about-page">
      <section className="dashboard-panel settings-about-identity" aria-label="Про HromadaHR">
        <img src={hromadaHRLogo} alt="" width="64" height="64" />
        <div className="settings-about-brand">HromadaHR</div>
        <p>Автоматизована система кадрового обліку</p>
        <span className="settings-about-version">Версія {appVersion ?? '—'}</span>
      </section>
      <section className="dashboard-panel settings-about-details" aria-label="Інформація про застосунок">
        <div className="settings-card-heading"><span className="settings-icon"><Info size={19} aria-hidden="true"/></span><div><h2>Відомості про програму</h2><p>Основна інформація про HromadaHR.</p></div></div>
        <dl className="settings-about-grid">
          <div><dt>Версія застосунку</dt><dd>{appVersion ?? 'Не вдалося визначити'}</dd></div>
          <div><dt>Тип застосунку</dt><dd>Настільний застосунок для Windows</dd></div>
          <div className="settings-about-purpose"><dt>Призначення</dt><dd>Облік працівників, персональних відомостей та історії кадрових призначень</dd></div>
        </dl>
      </section>
      <section className="dashboard-panel settings-about-details" aria-label="Технічна інформація">
        <div className="settings-card-heading"><span className="settings-icon"><HardDrive size={19} aria-hidden="true"/></span><div><h2>Технічна інформація</h2><p>Локальний режим роботи.</p></div></div>
        <dl className="settings-about-grid">
          <div><dt>Режим роботи</dt><dd>Автономний настільний застосунок</dd></div>
          <div><dt>Сховище даних</dt><dd>Локальна SQLite</dd></div>
        </dl>
      </section>
      <section className="dashboard-panel settings-about-details" aria-labelledby="settings-origin-title">
        <div className="settings-card-heading"><span className="settings-icon"><Code2 size={19} aria-hidden="true"/></span><div><h2 id="settings-origin-title">Розробка та походження</h2><p>Розробник системи та громада, для потреб якої її створено.</p></div></div>
        <dl className="settings-origin-grid">
          <div><dt><Code2 size={15} aria-hidden="true"/>Розробник системи</dt><dd>Анатолій Мироненко</dd></div>
          <div><dt><MapPin size={15} aria-hidden="true"/>Громада, для потреб якої створено систему</dt><dd>Вишнівська селищна територіальна громада, Кам'янський район, Дніпропетровська область</dd></div>
        </dl>
      </section>
    </div>}

  </div>
}
