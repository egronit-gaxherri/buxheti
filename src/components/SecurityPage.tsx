import { useEffect, useRef, useState } from 'react'
import { PinPad } from './PinPad'
import { lockNow } from './LockGate'
import { db } from '../db/db'
import { deleteSetting, KEYS, setSetting, useSetting } from '../db/settings'
import { loadMonthData } from '../db/queries'
import type { Budget, Category } from '../db/schema'
import { createPinRecord, OWNER_PIN, verifyPin, type PinRecord } from '../lib/pin'
import { biometricAvailable, registerBiometric } from '../lib/webauthn'
import { exportBackup, importBackup } from '../lib/backup'
import { allMonthsCsv, monthCsv } from '../lib/csv'
import { monthReportPdf } from '../lib/report'
import { saveFile } from '../lib/saveFile'
import { formatDateSQ, formatMonthSQ, todayStr } from '../lib/dates'

type PinFlow = null | { step: 'verify' } | { step: 'new' } | { step: 'confirm'; first: string }

interface Props {
  monthKey: string
  budgets: Budget[]
  categories: Category[]
}

export function SecurityPage({ monthKey, budgets, categories }: Props) {
  const pin = useSetting<PinRecord>(KEYS.pin)
  const bio = useSetting<{ credentialId: string }>(KEYS.biometric)
  const lastBackup = useSetting<string>(KEYS.lastBackup)
  const [flow, setFlow] = useState<PinFlow>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [reset, setReset] = useState(0)
  const [bioOk, setBioOk] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    biometricAvailable().then(setBioOk)
  }, [])

  const say = (text: string, ok = true) => setMsg({ text, ok })
  const activePin = pin ?? OWNER_PIN

  async function onPin(p: string) {
    if (!flow) return
    if (flow.step === 'verify') {
      if (!(await verifyPin(p, activePin))) {
        setReset((r) => r + 1)
        return say('PIN-i aktual është i gabuar', false)
      }
      setMsg(null)
      return setFlow({ step: 'new' })
    }
    if (flow.step === 'new') {
      setMsg(null)
      return setFlow({ step: 'confirm', first: p })
    }
    if (p !== flow.first) {
      setFlow({ step: 'new' })
      setReset((r) => r + 1)
      return say('PIN-et nuk përputhen. Provo përsëri.', false)
    }
    await setSetting(KEYS.pin, await createPinRecord(p))
    await setSetting(KEYS.pinFails, { count: 0, lockedUntil: 0 })
    setFlow(null)
    say('PIN-i i ri u ruajt.')
  }

  async function enableBio() {
    try {
      await setSetting(KEYS.biometric, { credentialId: await registerBiometric() })
      say('Face ID u aktivizua')
    } catch (e) {
      say(`Face ID nuk u aktivizua: ${(e as Error).message}`, false)
    }
  }

  async function doBackup() {
    const data = await exportBackup()
    await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `buxheti-backup-${todayStr()}.json`)
    await setSetting(KEYS.lastBackup, todayStr())
    say('Backup-i u krijua')
  }

  async function doRestore(file: File) {
    try {
      const json = JSON.parse(await file.text())
      const when = typeof json?.exportedAt === 'string' ? formatDateSQ(json.exportedAt.slice(0, 10)) : '?'
      if (!confirm(`Kjo do të ZËVENDËSOJË të gjitha të dhënat aktuale me backup-in e datës ${when}. Vazhdo?`)) return
      const c = await importBackup(json)
      say(`U rikthyen ${c.expenses} shpenzime, ${c.incomes} të hyra, ${c.transfers} transferime.`)
    } catch (e) {
      say(e instanceof SyntaxError ? 'Skedari nuk është JSON i vlefshëm' : (e as Error).message, false)
    }
  }

  async function doExport(kind: 'csv' | 'pdf' | 'all-csv') {
    if (kind === 'all-csv') {
      const [incomes, splits, expenses, transfers, adjustments] = await Promise.all([
        db.incomes.toArray(),
        db.incomeSplits.toArray(),
        db.expenses.toArray(),
        db.transfers.toArray(),
        db.adjustments.toArray(),
      ])
      await saveFile(
        new Blob([allMonthsCsv({ incomes, incomeSplits: splits, expenses, transfers, adjustments }, budgets, categories)], { type: 'text/csv;charset=utf-8' }),
        `buxheti-gjithsej-${todayStr()}.csv`,
      )
      return
    }
    const [data, incomes] = await Promise.all([loadMonthData(monthKey), db.incomes.where('monthKey').equals(monthKey).toArray()])
    const name = `buxheti-${monthKey}.${kind}`
    if (kind === 'csv') await saveFile(new Blob([monthCsv(data, incomes, budgets, categories)], { type: 'text/csv;charset=utf-8' }), name)
    else await saveFile(new Blob([monthReportPdf(data, incomes, budgets, categories)], { type: 'application/pdf' }), name)
  }

  if (pin === undefined || bio === undefined || lastBackup === undefined) return null

  if (flow) {
    const title =
      flow.step === 'verify' ? 'Fut PIN-in aktual' : flow.step === 'new' ? 'Zgjidh një PIN të ri (4–6 shifra)' : 'Fut PIN-in edhe një herë'
    return (
      <div className="flex flex-col items-center gap-6 pt-4">
        <p className="text-lg font-medium">{title}</p>
        {msg && <p className={`text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`} role="status">{msg.text}</p>}
        <PinPad
          key={flow.step}
          length={flow.step === 'verify' ? activePin.length : flow.step === 'confirm' ? flow.first.length : undefined}
          resetKey={reset}
          onComplete={onPin}
        />
        <button onClick={() => { setFlow(null); setMsg(null) }} className="text-muted">Anulo</button>
      </div>
    )
  }

  const row = 'flex h-14 w-full items-center justify-between rounded-2xl bg-surface px-4 text-left active:bg-surface-2 disabled:opacity-40'

  return (
    <div className="space-y-6">
      {msg && <p className={`rounded-2xl p-3 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`} role="status">{msg.text}</p>}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-muted">Kyçja & Autorizimi</h2>
        <button onClick={() => setFlow({ step: 'verify' })} className={row}>🔐 Ndrysho PIN-in <span className="text-muted">›</span></button>
        {bio ? (
          <button onClick={() => deleteSetting(KEYS.biometric).then(() => say('Face ID u çaktivizua'))} className={row}>
            🙂 Face ID: aktiv <span className="text-sm text-muted">Çaktivizo</span>
          </button>
        ) : (
          <button onClick={enableBio} disabled={!bioOk} className={row}>
            🙂 Aktivizo Face ID <span className="text-muted">›</span>
          </button>
        )}
        {bioOk === false && !bio && <p className="px-1 text-xs text-muted">Face ID / Touch ID nuk është i disponueshëm këtu (kërkon HTTPS dhe pajisje me biometri).</p>}
        <button onClick={lockNow} className={row}>🔒 Kyçe aplikacionin tani <span className="text-muted">›</span></button>
        <p className="px-1 text-xs text-muted">
          Aplikacioni është privat: kërkon PIN ose Face ID në çdo hapje, në çdo pajisje të re, dhe pas {30} sekondash në sfond.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-muted">Backup</h2>
        <button onClick={doBackup} className={row}>💾 Shkarko backup (JSON) <span className="text-muted">›</span></button>
        <button onClick={() => fileRef.current?.click()} className={row}>♻️ Rikthe nga backup <span className="text-muted">›</span></button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) doRestore(f)
          }}
        />
        <p className="px-1 text-xs text-muted">
          {lastBackup ? `Backup-i i fundit: ${formatDateSQ(lastBackup)}.` : 'Ende asnjë backup.'} Backup-i përfshin edhe fotot e faturave, por jo PIN-in.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-muted">Eksport · {formatMonthSQ(monthKey)}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => doExport('csv')} className="h-14 rounded-2xl bg-surface font-medium active:bg-surface-2">📊 CSV ({formatMonthSQ(monthKey)})</button>
          <button onClick={() => doExport('pdf')} className="h-14 rounded-2xl bg-surface font-medium active:bg-surface-2">📄 PDF ({formatMonthSQ(monthKey)})</button>
        </div>
        <button onClick={() => doExport('all-csv')} className={row}>🗂️ Eksporto të gjithë muajt (CSV) <span className="text-muted">›</span></button>
        <p className="px-1 text-xs text-muted">Për raportin e një muaji tjetër, ndrysho muajin lart me ‹ ›.</p>
      </section>
    </div>
  )
}
