import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from './Sheet'
import { db } from '../db/db'
import { useMonth } from '../db/hooks'
import { closeMonth, reopenMonth } from '../db/actions'
import type { Budget } from '../db/schema'
import { monthTotals } from '../lib/archive'
import { formatMonthSQ, shiftMonth } from '../lib/dates'
import { formatEUR } from '../lib/money'

interface Props {
  monthKey: string
  budgets: Budget[]
  onClose: () => void
}

/** Përmbledhja e muajit dhe zgjedhja e bartjes së mbetjes në muajin tjetër. */
export function CloseMonthSheet({ monthKey, budgets, onClose }: Props) {
  const { data, summaries } = useMonth(monthKey)
  const record = useLiveQuery(async () => (await db.months.get(monthKey)) ?? null, [monthKey])
  const [carry, setCarry] = useState<Record<string, boolean> | null>(null)
  const next = formatMonthSQ(shiftMonth(monthKey, 1))

  // Si parazgjedhje: barte mbetjen pozitive, jo deficitin
  useEffect(() => {
    if (summaries && carry === null) setCarry(Object.fromEntries(summaries.map((s) => [s.budgetId, s.remaining > 0])))
  }, [summaries, carry])

  if (!data || !summaries || record === undefined || !carry) return null
  const t = monthTotals(data)
  const closed = !!record?.closed

  async function confirmClose() {
    const amounts = Object.fromEntries(summaries!.filter((s) => carry![s.budgetId] && s.remaining !== 0).map((s) => [s.budgetId, s.remaining]))
    await closeMonth(monthKey, amounts)
    onClose()
  }

  return (
    <Sheet title={`${closed ? 'Muaji i mbyllur' : 'Mbyll muajin'} · ${formatMonthSQ(monthKey)}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <dl className="tabnum grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-4 text-sm">
          <div><dt className="text-muted">Të hyra</dt><dd className="font-semibold">{formatEUR(t.income)}</dd></div>
          <div><dt className="text-muted">Shpenzime</dt><dd className="font-semibold">{formatEUR(t.spent)}</dd></div>
          <div><dt className="text-muted">Kursim</dt><dd className={`font-semibold ${t.saved < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatEUR(t.saved)}</dd></div>
        </dl>

        {closed ? (
          <>
            <div className="space-y-2">
              {budgets.map((b) => {
                const c = record?.carried?.[b.id]
                return (
                  <div key={b.id} className="flex justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm">
                    <span>{b.name}</span>
                    <span className="tabnum text-muted">{c ? `u bart ${formatEUR(c)} → ${next}` : 'pa bartje'}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted">Nëse rihap muajin, bartja hiqet nga {next}; mund ta mbyllësh sërish pas ndryshimeve.</p>
            <button onClick={() => reopenMonth(monthKey).then(onClose)} className="h-14 rounded-2xl bg-surface-2 font-semibold">🔓 Hap përsëri muajin</button>
          </>
        ) : (
          <>
            <h3 className="text-sm font-medium text-muted">Mbetja e çdo buxheti</h3>
            {budgets.map((b) => {
              const s = summaries.find((x) => x.budgetId === b.id)!
              return (
                <label key={b.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
                  <span className="size-3 rounded-full" style={{ background: b.color }} />
                  <span className="flex-1">
                    <span className="block font-medium">{b.name}</span>
                    <span className={`tabnum text-sm ${s.remaining < 0 ? 'text-red-300' : 'text-muted'}`}>{formatEUR(s.remaining)}</span>
                  </span>
                  <span className="text-xs text-muted">Barte në {next}</span>
                  <input
                    type="checkbox"
                    checked={carry[b.id] ?? false}
                    disabled={s.remaining === 0}
                    onChange={(e) => setCarry({ ...carry, [b.id]: e.target.checked })}
                    className="size-6 accent-sky-400"
                  />
                </label>
              )
            })}
            <p className="text-xs text-muted">Mbetja e bartur shtohet te totali i buxhetit në {next}. Një mbetje negative, nëse e bart, zbritet prej tij.</p>
            <button onClick={confirmClose} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900">Mbyll muajin</button>
          </>
        )}
      </div>
    </Sheet>
  )
}
