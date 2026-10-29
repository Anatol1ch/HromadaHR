import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <h1>HromadaHR</h1>
      <p>Система кадрового обліку</p>
      <p role="status">Технічну основу застосунку створено</p>
    </main>
  </StrictMode>,
)
