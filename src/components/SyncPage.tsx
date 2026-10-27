import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { useSetting } from '../db/settings'
import type { Budget } from '../db/schema'
import { createHousehold, joinHousehold, leaveHousehold, supabaseApi, SYNC_KEY } from '../sync/household'
import { rpc, syncAvailable, type HouseholdInfo } from '../sync/remote'
import { syncNow, useSyncStatus } from '../sync/controller'
import type { SyncConfig } from '../sync/types'

const fmtCode = (c: string) => c.replace(/(.{5})(.{5})/, '$1-$2')

function ago(ts?: number) {
  if (!ts) return 'asnjëherë'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 10) return 'tani'
  if (s < 60) return `para ${s} s`
  if (s < 3600) return `para ${Math.round(s / 60)} min`
  return new Date(ts).toLocaleString('sq-AL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SyncPage({ budgets }: { budgets: Budget[] }) {
  const cfg = useSetting<SyncConfig>(SYNC_KEY)
  const status = useSyncStatus()
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('Shtëpia jonë')
  const [shared, setShared] = useState<string[]>(budgets[0] ? [budgets[0].id] : [])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState<HouseholdInfo | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15_000) // rifresko "para X min"
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!cfg) return setInfo(null)
    rpc<HouseholdInfo>('household_info', { p_token: cfg.token }).then(setInfo).catch(() => undefined)
  }, [cfg?.memberId, status.lastSyncAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!syncAvailable())
    return (
      <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
        Sinkronizimi nuk është konfiguruar në këtë version. Shto <code>VITE_SUPABASE_URL</code> dhe <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> te <code>.env.local</code> dhe ndërto sërish.
      </p>
    )
  if (cfg === undefined) return null

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) {
    return (
      <div className="space-y-4">
        <p className="px-1 text-sm text-muted">
          Ndaj buxhetin e Shtëpisë me familjen: secili shton shpenzime nga telefoni i vet dhe të gjithë shohin të njëjtën mbetje.
          Buxheti Personal, borxhet dhe fotot e faturave mbeten vetëm në këtë telefon.
        </p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emri yt (p.sh. Egronit)" aria-label="Emri yt" className="h-12 w-full rounded-2xl bg-surface px-4 outline-none" />

        <section className="space-y-3 rounded-3xl bg-surface p-5">
          <h2 className="font-semibold">Krijo familjen</h2>
          <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} aria-label="Emri i familjes" className="h-11 w-full rounded-xl bg-surface-2 px-3 outline-none" />
          <div className="text-sm text-muted">Buxhetet që ndahen:</div>
          {budgets.map((b) => (
            <label key={b.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="size-3 rounded-full" style={{ background: b.color }} />
              <span className="flex-1">{b.name}</span>
              <input
                type="checkbox"
                checked={shared.includes(b.id)}
                onChange={(e) => setShared(e.target.checked ? [...shared, b.id] : shared.filter((x) => x !== b.id))}
                className="size-5 accent-sky-400"
              />
            </label>
          ))}
          <button
            disabled={busy || !name.trim() || shared.length === 0}
            onClick={() => run(() => createHousehold(db, supabaseApi, { householdName, memberName: name, sharedBudgetIds: shared }))}
            className="h-12 w-full rounded-xl bg-white font-semibold text-slate-900 disabled:opacity-35"
          >
            {busy ? 'Duke krijuar…' : 'Krijo familjen'}
          </button>
        </section>

        <section className="space-y-3 rounded-3xl bg-surface p-5">
          <h2 className="font-semibold">Bashkohu me kod</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE-FGHJK"
            aria-label="Kodi i ftesës"
            autoCapitalize="characters"
            className="h-12 w-full rounded-xl bg-surface-2 px-3 text-center font-mono text-lg tracking-widest outline-none"
          />
          <p className="text-xs text-muted">Buxheti yt me të njëjtin emër (p.sh. "Shtëpi") bashkohet me atë të familjes, bashkë me shpenzimet e tij.</p>
          <button
            disabled={busy || !name.trim() || code.replace(/[^A-Z0-9]/g, '').length < 10}
            onClick={() => run(() => joinHousehold(db, supabaseApi, { code, memberName: name }))}
            className="h-12 w-full rounded-xl bg-white font-semibold text-slate-900 disabled:opacity-35"
          >
            {busy ? 'Duke u bashkuar…' : 'Bashkohu'}
          </button>
        </section>
        {error && <p className="px-1 text-sm text-danger" role="alert">{error}</p>}
      </div>
    )
  }

  const statusText =
    status.state === 'syncing' ? 'Duke sinkronizuar…'
    : status.removed ? 'Kjo pajisje u hoq nga familja.'
    : status.state === 'error' ? `Gabim: ${status.error}`
    : status.offline ? `Pa internet — ndryshimet ruhen dhe dërgohen kur të kthehet lidhja. Sinkronizuar ${ago(cfg.lastSyncAt)}.`
    : `Sinkronizuar ${ago(cfg.lastSyncAt)}`
  const dot = status.state === 'error' ? 'bg-red-400' : status.offline ? 'bg-amber-400' : status.state === 'syncing' ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'
  const appUrl = `${location.origin}${import.meta.env.BASE_URL}`
  const invite = `Bashkohu me buxhetin e familjes "${cfg.householdName}" në Buxheti: ${appUrl}\nKodi: ${fmtCode(info?.join_code ?? cfg.joinCode)}`

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-surface p-5">
        <div className="text-sm text-muted">Familja</div>
        <div className="text-xl font-semibold">{info?.household_name ?? cfg.householdName}</div>
        <div className="mt-2 flex items-center gap-2 text-sm" role="status">
          <span className={`size-2.5 rounded-full ${dot}`} />
          <span className="text-muted">{statusText}</span>
        </div>
        <button onClick={() => syncNow()} disabled={status.state === 'syncing'} className="mt-3 h-10 rounded-xl bg-surface-2 px-4 text-sm disabled:opacity-40">↻ Sinkronizo tani</button>
      </section>

      <section className="rounded-3xl bg-surface p-5">
        <div className="text-sm text-muted">Kodi i ftesës</div>
        <div className="mt-1 font-mono text-2xl tracking-widest">{fmtCode(info?.join_code ?? cfg.joinCode)}</div>
        <p className="mt-1 text-xs text-muted">Kushdo me këtë kod mund të bashkohet. Jepja vetëm familjarëve.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => (navigator.share ? navigator.share({ text: invite }).catch(() => undefined) : navigator.clipboard.writeText(invite))}
            className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900"
          >
            Fto dikë
          </button>
          {info?.role === 'owner' && (
            <button
              onClick={() => confirm('Kodi i vjetër nuk do të funksionojë më. Vazhdo?') && run(async () => setInfo({ ...info, join_code: await rpc<string>('rotate_join_code', { p_token: cfg.token }) }))}
              className="h-10 rounded-xl bg-surface-2 px-4 text-sm"
            >
              Kod i ri
            </button>
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-5">
        <h2 className="mb-2 font-semibold">Anëtarët</h2>
        <ul className="space-y-2 text-sm">
          {(info?.members ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="flex-1">
                {m.display_name}
                {m.id === cfg.memberId && <span className="text-muted"> (ti)</span>}
                {m.role === 'owner' && <span className="text-muted"> · krijuesi</span>}
              </span>
              {info?.role === 'owner' && m.id !== cfg.memberId && (
                <button
                  onClick={() => confirm(`Ta heqësh ${m.display_name} nga familja?`) && run(async () => {
                    await rpc('remove_member', { p_token: cfg.token, p_member_id: m.id })
                    setInfo({ ...info, members: info.members.filter((x) => x.id !== m.id) })
                  })}
                  className="text-xs text-red-300"
                >
                  Hiq
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 text-sm text-muted">
          Të përbashkëta: {budgets.filter((b) => b.shared).map((b) => b.name).join(', ') || '—'}
        </div>
      </section>

      {error && <p className="px-1 text-sm text-danger" role="alert">{error}</p>}
      <button
        onClick={() => confirm('Të largohesh nga familja? Të dhënat në këtë telefon mbeten, por nuk sinkronizohen më.') && run(() => leaveHousehold(db, supabaseApi))}
        className="h-12 w-full rounded-2xl bg-red-500/15 font-semibold text-red-400"
      >
        Largohu nga familja
      </button>
    </div>
  )
}
