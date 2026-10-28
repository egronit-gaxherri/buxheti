import { useEffect, useState, type ReactNode } from 'react'
import { PinPad } from './PinPad'
import { getSetting, KEYS, setSetting, useSetting, type PinFails } from '../db/settings'
import { lockoutMs, OWNER_PIN, verifyPin, type PinRecord } from '../lib/pin'
import { verifyBiometric } from '../lib/webauthn'

/** Kyçet sërish pasi aplikacioni ka qëndruar në sfond më shumë se kaq. */
export const LOCK_AFTER_MS = 30_000

let triggerLock: (() => void) | null = null

/** Kyç aplikacionin menjëherë (p.sh. nga butoni 🔒 në Ballinë). */
export function lockNow() {
  triggerLock?.()
}

/**
 * Mban aplikacionin të fshehur derisa të futet PIN-i i pronarit ose Face ID.
 * Edhe në hapjen e parë në çdo pajisje të re kërkohet kodi i pronarit (`OWNER_PIN`),
 * kështu që askush i huaj që hap linkun nuk mund të hyjë.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const pin = useSetting<PinRecord>(KEYS.pin)
  const bio = useSetting<{ credentialId: string }>(KEYS.biometric)
  const [locked, setLocked] = useState(true)
  const [cover, setCover] = useState(false)

  useEffect(() => {
    triggerLock = () => setLocked(true)
    return () => {
      triggerLock = null
    }
  }, [])

  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        setCover(true) // fsheh shumat nga pamja e "app switcher"
      } else {
        setCover(false)
        if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (pin === undefined || bio === undefined) return null
  const activePin = pin ?? OWNER_PIN
  const isFirstVisit = pin === null

  return (
    <>
      <div className="h-full" style={{ display: locked ? 'none' : undefined }} aria-hidden={locked}>
        {children}
      </div>
      {locked && (
        <LockScreen
          pin={activePin}
          bio={bio}
          isFirstVisit={isFirstVisit}
          onUnlock={async () => {
            if (isFirstVisit) await setSetting(KEYS.pin, OWNER_PIN)
            setLocked(false)
          }}
        />
      )}
      {cover && !locked && <div className="fixed inset-0 z-[90] bg-bg" />}
    </>
  )
}

function LockScreen({
  pin,
  bio,
  isFirstVisit,
  onUnlock,
}: {
  pin: PinRecord
  bio: { credentialId: string } | null
  isFirstVisit: boolean
  onUnlock: () => void | Promise<void>
}) {
  const [error, setError] = useState('')
  const [reset, setReset] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    getSetting<PinFails>(KEYS.pinFails).then((f) => f && setLockedUntil(f.lockedUntil))
  }, [])
  useEffect(() => {
    if (lockedUntil <= now) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [lockedUntil, now])

  const waitS = Math.ceil((lockedUntil - now) / 1000)
  const blocked = waitS > 0

  async function tryPin(p: string) {
    setChecking(true)
    const ok = await verifyPin(p, pin)
    setChecking(false)
    if (ok) {
      await setSetting(KEYS.pinFails, { count: 0, lockedUntil: 0 })
      return onUnlock()
    }
    const prev = (await getSetting<PinFails>(KEYS.pinFails)) ?? { count: 0, lockedUntil: 0 }
    const count = prev.count + 1
    const ms = lockoutMs(count)
    const until = ms ? Date.now() + ms : 0
    await setSetting(KEYS.pinFails, { count, lockedUntil: until })
    setLockedUntil(until)
    setNow(Date.now())
    setError(ms ? 'Shumë tentativa të gabuara.' : 'PIN i gabuar')
    navigator.vibrate?.([40, 60, 40])
    setReset((r) => r + 1)
  }

  async function tryBio() {
    if (!bio) return
    setError('')
    if (await verifyBiometric(bio.credentialId)) {
      await setSetting(KEYS.pinFails, { count: 0, lockedUntil: 0 })
      onUnlock()
    } else setError('Face ID nuk u verifikua. Përdor PIN-in.')
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="text-center">
        <div className="text-2xl font-semibold">Buxheti</div>
        {isFirstVisit && <div className="mt-1 text-xs font-medium text-sky-300">🔒 Qasje private · Vetëm për pronarin</div>}
        <div className="mt-1 text-muted" role="status">
          {blocked ? `Provo përsëri pas ${waitS} s` : error || (isFirstVisit ? 'Fut kodin e pronarit për të aktivizuar pajisjen' : 'Fut PIN-in')}
        </div>
      </div>
      <PinPad
        length={pin.length}
        disabled={blocked || checking}
        resetKey={reset}
        onComplete={tryPin}
        extraKey={bio ? { label: 'Face ID', aria: 'Hap me Face ID', onPress: tryBio } : undefined}
      />
    </div>
  )
}
