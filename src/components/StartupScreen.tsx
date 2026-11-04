// Adapted from HromadaAID 33eca107 src/App.tsx StartupScreen.
import { UsersRound } from 'lucide-react'

export default function StartupScreen() {
  return <main className="app-startup" aria-busy="true" aria-label="Підготовка робочого простору HromadaHR">
    <div className="app-startup-content" role="status" aria-live="polite">
      <div className="app-startup-mark"><UsersRound size={34} strokeWidth={2} aria-hidden="true"/></div>
      <div className="app-startup-name">Hromada<span>HR</span></div>
      <p>Автоматизована система кадрового обліку</p>
      <span className="app-startup-loader" aria-hidden="true"/>
      <span className="visually-hidden">Підготовка робочого простору…</span>
    </div>
  </main>
}
