import KeyboardNavigation from './components/KeyboardNavigation'
import SystemToastHost from './components/SystemToastHost'
import { UnsavedChangesConfirmation } from './components/ConfirmDialog'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeyboardNavigation><App /><SystemToastHost /><UnsavedChangesConfirmation /></KeyboardNavigation>
  </StrictMode>,
)
