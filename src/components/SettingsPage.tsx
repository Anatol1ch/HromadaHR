// Adapted from HromadaAID 33eca10733caaf73b1a99e75a24ff35e706a0afb src/SettingsPage.tsx.
import { Code2, HardDrive, Info, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import hromadaHRLogo from '../../assets/hromadahr.svg?no-inline'
import BackupSettings from './BackupSettings'

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<'backup' | 'about'>('backup')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void window.hromadaHR.system.getInfo().then(result => {
      if (active) setAppVersion(result.ok ? result.data.version : null)
    }).catch(() => { if (active) setAppVersion(null) })
    return () => { active = false }
  }, [])
  return <div className="settings-page">
    <header className="page-heading settings-heading"><div><div className="eyebrow">СИСТЕМА</div><h1>Налаштування</h1><p className="subtitle">Параметри застосунку та інформація про програму.</p></div>
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
        <span className="settings-about-version">Версія {appVersion ?? '–'}</span>
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
