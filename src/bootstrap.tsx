import KeyboardNavigation from './components/KeyboardNavigation'
import SystemToastHost from './components/SystemToastHost'
import { UnsavedChangesConfirmation } from './components/ConfirmDialog'
import { Component, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Adapted from HromadaAID 33eca107 src/main.tsx. No auth/update gate.
class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="app-start-error" role="alert"><div>
      <strong>Не вдалося підготувати робочий простір.</strong>
      <span>Перезапустіть HromadaHR. Якщо проблема повторюється, зверніться до адміністратора системи.</span>
    </div></main>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><StartupBoundary>
    <KeyboardNavigation><App /><SystemToastHost /><UnsavedChangesConfirmation /></KeyboardNavigation>
  </StartupBoundary></StrictMode>,
)
