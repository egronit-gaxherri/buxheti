import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { LockGate } from './components/LockGate'
import { seedIfEmpty } from './db/seed'
import { registerSW } from 'virtual:pwa-register'

// Service worker: aplikacioni punon offline dhe përditësohet vetë kur ka version të ri
registerSW({ immediate: true })

// Kërko ruajtje të qëndrueshme që iOS të mos e pastrojë IndexedDB
navigator.storage?.persist?.()

seedIfEmpty().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LockGate>
        <App />
      </LockGate>
    </StrictMode>,
  )
})
