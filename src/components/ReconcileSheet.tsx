import { useState } from 'react'
import { Sheet } from './Sheet'
import { reconcileBalances, type ReconcileMode } from '../db/actions'
import { useMonth } from '../db/hooks'
import type { Budget, Category } from '../db/schema'
import { FALLBACK_CATEGORY_NAME } from '../lib/categorize'
import { currentMonthKey, formatMonthSQ } from '../lib/dates'
import { formatEUR, parseAmount } from '../lib/money'

interface Props {
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
}

/** Fut shumën reale për çdo buxhet; aplikacioni regjistron diferencën. */
export function ReconcileSheet({ budgets, categories, onClose }: Props) {
  const mk = currentMonthKey()
  const { summaries } = useMonth(mk)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [modes, setModes] = useState<Record<string, ReconcileMode>>({})
  const [busy, setBusy] = useState(false)
  const fallback = categories.find((c) => c.name === FALLBACK_CATEGORY_NAME) ?? categories[0]

  if (!summaries) return null

  const rows = budgets.map((b) => {
    const remaining = summaries.find((s) => s.budgetId === b.id)?.remaining ?? 0
    const text = vals[b.id]
    const actual = text == null || text.trim() === '' ? null : parseAmount(text)
    return { b, remaining, actual, diff: actual == null ? 0 : actual - remaining }
  })
  const changes = rows.filter((r) => r.actual != null && r.diff !== 0)

  async function save() {
    setBusy(true)
    await reconcileBalances(
      changes.map((r) => ({ budgetId: r.b.id, actual: r.actual!, mode: modes[r.b.id] ?? 'adjustment' })),
      fallback.id,
    )
    onClose()
  }

  return (
    <Sheet title="Përshtat bilancin" onClose={onClose}>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted">
          Fut sa ke realisht në dorë ose në llogari për çdo buxhet. Diferenca regjistrohet te {formatMonthSQ(mk)} që mbetja të përputhet me realitetin.
        </p>
        {rows.map(({ b, remaining, actual, diff }) => (
          <div key={b.id} className="rounded-2xl bg-surface-2 p-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: b.color }} />
              <span className="flex-1 font-medium">{b.name}</span>
              <span className="tabnum text-sm text-muted">Në aplikacion: {formatEUR(remaining)}</span>
            </div>
            <input
              value={vals[b.id] ?? ''}
              onChange={(e) => setVals({ ...vals, [b.id]: e.target.value })}
              inputMode="decimal"
              placeholder="Sa ke realisht (€)"
              aria-label={`Bilanci real për ${b.name}`}
              className="mt-3 h-12 w-full rounded-xl bg-bg px-4 text-lg outline-none"
            />
            {actual != null && (
              <div className="mt-3 text-sm">
                {diff === 0 ? (
                  <span className="text-ok">✓ Përputhet</span>
                ) : (
                  <>
                    <span className={diff < 0 ? 'text-red-300' : 'text-emerald-300'}>
                      Diferenca: {formatEUR(diff, { sign: true })} {diff < 0 ? '(mungojnë para)' : '(tepër para)'}
                    </span>
                    {diff < 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {([['adjustment', 'Korrigjim'], ['untracked', 'Shpenzim i pashënuar']] as const).map(([m, label]) => (
                          <button
                            key={m}
                            onClick={() => setModes({ ...modes, [b.id]: m })}
                            className={`h-10 rounded-xl text-xs font-medium ${(modes[b.id] ?? 'adjustment') === m ? 'bg-white text-slate-900' : 'bg-bg'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <button disabled={changes.length === 0 || busy} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
          {changes.length === 0 ? 'Asnjë diferencë për të regjistruar' : `Regjistro ${changes.length} ${changes.length === 1 ? 'diferencë' : 'diferenca'}`}
        </button>
      </div>
    </Sheet>
  )
}
