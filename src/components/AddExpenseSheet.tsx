import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from './Sheet'
import { NumPad } from './NumPad'
import { addExpense, addExpenseWithCover, suggestDescriptions } from '../db/actions'
import { loadMonthData } from '../db/queries'
import { useMonth } from '../db/hooks'
import { summarizeMonth } from '../lib/calc'
import { formatEUR } from '../lib/money'
import { db } from '../db/db'
import type { Budget, Category, Expense, Transfer } from '../db/schema'
import { FALLBACK_CATEGORY_NAME, guessCategory, normalize } from '../lib/categorize'
import { numpadToCents } from '../lib/numpad'
import { monthKeyOf, todayStr } from '../lib/dates'

interface Props {
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
  onSaved: (e: Expense, cover?: Transfer) => void
}

export function AddExpenseSheet({ budgets, categories, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [manualCat, setManualCat] = useState<string | null>(null)
  const [pickingCat, setPickingCat] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState<{ budgetId: string; remaining: number; others: { budget: Budget; remaining: number }[] } | null>(null)
  const descRef = useRef<HTMLInputElement>(null)

  const suggestions = useLiveQuery(() => suggestDescriptions(desc), [desc]) ?? []
  const history = useLiveQuery(() => db.descriptions.get(normalize(desc)), [desc])

  const fallback = categories.find((c) => c.name === FALLBACK_CATEGORY_NAME) ?? categories[categories.length - 1]
  const autoCatId = useMemo(() => guessCategory(desc, categories, history) ?? fallback?.id, [desc, categories, history, fallback])
  const catId = manualCat ?? autoCatId
  const category = categories.find((c) => c.id === catId)

  const cents = numpadToCents(amount)
  const { summaries: dateSums } = useMonth(monthKeyOf(date))
  const leftOf = (id: string) => dateSums?.find((s) => s.budgetId === id)?.remaining

  useEffect(() => setManualCat(null), [desc]) // ndryshimi i përshkrimit rifillon auto-kategorinë

  const payload = (budgetId: string) => ({ amount: cents, description: desc, budgetId, categoryId: catId!, date })

  /** Nëse shpenzimi e kalon mbetjen e buxhetit, pyet para se ta ruajë. */
  async function attempt(budgetId: string) {
    if (cents <= 0 || !catId || saving) return
    const sums = summarizeMonth(await loadMonthData(monthKeyOf(date)), date)
    const remaining = sums.find((s) => s.budgetId === budgetId)?.remaining ?? 0
    if (cents <= remaining) return commit(budgetId)
    setWarn({
      budgetId,
      remaining,
      others: budgets.filter((b) => b.id !== budgetId).map((b) => ({ budget: b, remaining: sums.find((s) => s.budgetId === b.id)?.remaining ?? 0 })),
    })
  }

  async function commit(budgetId: string, coverFrom?: string) {
    setSaving(true)
    if (coverFrom && warn) {
      const { expense, transfer } = await addExpenseWithCover(payload(budgetId), { fromBudgetId: coverFrom, amount: cents - warn.remaining })
      onSaved(expense, transfer)
    } else {
      onSaved(await addExpense(payload(budgetId)))
    }
  }

  return (
    <Sheet title="Shpenzim i ri" onClose={onClose} full>
      <div className="flex min-h-full flex-col gap-3 pb-3">
        <div className="px-5 text-center">
          <div className="tabnum text-6xl font-bold tracking-tight">
            {amount || '0'}
            <span className="ml-1 text-4xl text-muted">€</span>
          </div>
        </div>

        <div className="px-4">
          <input
            ref={descRef}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Përshkrimi (p.sh. Benzin)"
            autoCapitalize="sentences"
            enterKeyHint="done"
            className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-lg outline-none placeholder:text-muted focus:ring-2 focus:ring-sky-400/60"
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setDesc(s.display)} /* kategoria vjen nga historiku */
                  className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm text-white/90 active:bg-surface-2"
                >
                  {s.display}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4">
          <button onClick={() => setPickingCat((v) => !v)} className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm">
            <span>{category?.icon}</span>
            <span>{category?.name}</span>
            {!manualCat && desc && autoCatId !== fallback?.id && <span className="text-xs text-muted">auto</span>}
            <span className="text-muted">▾</span>
          </button>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-auto h-10 rounded-full bg-surface-2 px-3 text-sm text-white/90 outline-none"
            aria-label="Data"
          />
        </div>

        {pickingCat && (
          <div className="flex flex-wrap gap-2 px-4">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setManualCat(c.id)
                  setPickingCat(false)
                }}
                className={`rounded-full px-3 py-1.5 text-sm ${c.id === catId ? 'bg-sky-400 text-slate-900' : 'bg-surface-2'}`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        )}

        {warn ? (
          <div className="mt-auto space-y-3 px-4" role="alertdialog" aria-label="Paralajmërim buxheti">
            {(() => {
              const b = budgets.find((x) => x.id === warn.budgetId)!
              const shortfall = cents - warn.remaining
              return (
                <>
                  <div className="rounded-2xl bg-amber-500/10 p-4 text-amber-200">
                    <p className="font-semibold">⚠ Ky shpenzim ({formatEUR(cents)}) e kalon mbetjen e {b.name}</p>
                    <p className="mt-1 text-sm">Kanë mbetur {formatEUR(warn.remaining)}; do të mungojnë {formatEUR(shortfall)}.</p>
                  </div>
                  {warn.others.map((o) => (
                    <button
                      key={o.budget.id}
                      disabled={o.remaining < shortfall || saving}
                      onClick={() => commit(warn.budgetId, o.budget.id)}
                      className="h-14 w-full rounded-2xl bg-surface-2 px-4 text-left font-semibold disabled:opacity-40"
                    >
                      Mbulo {formatEUR(shortfall)} me transferim nga {o.budget.name}
                      <span className="block text-xs font-normal text-muted">{o.budget.name} ka {formatEUR(o.remaining)}</span>
                    </button>
                  ))}
                  <button disabled={saving} onClick={() => commit(warn.budgetId)} className="h-14 w-full rounded-2xl text-lg font-bold text-slate-900" style={{ background: b.color }}>
                    Ruaj gjithsesi
                  </button>
                  <button onClick={() => setWarn(null)} className="h-12 w-full rounded-2xl text-muted">Anulo</button>
                </>
              )
            })()}
          </div>
        ) : (
        <div className="mt-auto flex flex-col gap-3">
            <NumPad value={amount} onChange={setAmount} />
            <div className="px-4 text-xs font-medium text-muted">Paguar nga:</div>
            <div className="-mt-1 grid gap-2 px-4" style={{ gridTemplateColumns: `repeat(${Math.min(budgets.length, 2)}, 1fr)` }}>
              {budgets.map((b) => {
                const left = leftOf(b.id)
                const short = left !== undefined && cents > 0 && cents > left
                return (
                  <button
                    key={b.id}
                    disabled={cents <= 0 || saving}
                    onClick={() => attempt(b.id)}
                    aria-label={`Paguar nga ${b.name}`}
                    className="flex h-16 flex-col items-center justify-center rounded-2xl text-slate-900 transition active:scale-[0.98] disabled:opacity-35"
                    style={{ background: b.color }}
                  >
                    <span className="text-xl font-bold leading-tight">{b.name}</span>
                    {left !== undefined && (
                      <span className={`tabnum text-xs font-medium ${short ? 'text-red-800' : 'text-slate-800/80'}`}>
                        {short ? `ka vetëm ${formatEUR(left)}` : `ka ${formatEUR(left)}`}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          )}
      </div>
    </Sheet>
  )
}
