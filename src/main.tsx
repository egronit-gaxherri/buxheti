import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedIfEmpty } from './db/seed'

// Kërko ruajtje të qëndrueshme që iOS të mos e pastrojë IndexedDB
navigator.storage?.persist?.()

seedIfEmpty().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
