import Dexie from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { localChanges } from './engine'
import { getSyncConfig, runSync, supabaseApi } from './household'
import { RemoteError, syncAvailable } from './remote'

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error'
  offline?: boolean
  error?: string
  /** Pajisja u hoq nga familja (tokeni nuk vlen më). */
  removed?: boolean
  lastSyncAt?: number
}

let status: SyncStatus = { state: 'off' }
const listeners = new Set<() => void>()
const set = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s }
  listeners.forEach((l) => l())
}
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  )

let running: Promise<void> | null = null
let again = false

/** Sinkronizon tani; thirrjet e njëkohshme bashkohen në një cikël shtesë. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await cycle()
    } while (again)
  })().finally(() => (running = null))
  return running
}

async function cycle() {
  const cfg = await getSyncConfig(db)
  if (!cfg || !syncAvailable()) return set({ state: 'off', error: undefined, removed: false })
  set({ state: 'syncing' })
  try {
    await runSync(db, supabaseApi)
    set({ state: 'idle', offline: false, error: undefined, removed: false, lastSyncAt: Date.now() })
    // ndryshime të bëra gjatë sinkronizimit → edhe një cikël
    const cur = await getSyncConfig(db)
    if (cur && (await localChanges(db, cur)).length > 0) again = true
  } catch (e) {
    const code = e instanceof RemoteError ? e.code : ''
    if (code === 'offline') set({ state: 'idle', offline: true })
    else set({ state: 'error', error: (e as Error).message, removed: code === 'invalid_token' })
  }
}

/**
 * Nis sinkronizimin në sfond: menjëherë, pas çdo ndryshimi lokal (me vonesë 1,5 s),
 * kur aplikacioni vjen në plan të parë, kur kthehet interneti, dhe çdo 30 s kur është i hapur.
 */
export function startSyncLoop(): () => void {
  if (!syncAvailable()) return () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = () => {
    if (running) return // ndryshimet tona gjatë zbatimit nuk rinisin sinkronizimin
    clearTimeout(timer)
    timer = setTimeout(syncNow, 1500)
  }
  const onVisible = () => document.visibilityState === 'visible' && syncNow()
  const tick = setInterval(() => document.visibilityState === 'visible' && syncNow(), 30_000)
  Dexie.on('storagemutated', soon)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', syncNow)
  syncNow()
  return () => {
    clearTimeout(timer)
    clearInterval(tick)
    Dexie.on('storagemutated').unsubscribe(soon)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', syncNow)
  }
}
