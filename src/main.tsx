import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { LockGate } from './components/LockGate'
import { seedIfEmpty } from './db/seed'
import { registerSW } from 'virtual:pwa-register'

// Service worker: aplikacioni punon offline dhe rifreskohet automatikisht sapo aktivizohet versioni i ri
let refreshing = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return
  refreshing = true
  window.location.reload()
})
registerSW({
  immediate: true,
  onRegisteredSW(_, r) {
    if (!r) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') r.update()
    })
  },
})

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
