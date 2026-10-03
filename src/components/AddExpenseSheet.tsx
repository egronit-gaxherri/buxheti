import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from './Sheet'
import { NumPad } from './NumPad'
import { addExpense, suggestDescriptions } from '../db/actions'
import { db } from '../db/db'
import type { Budget, Category, Expense } from '../db/schema'
import { FALLBACK_CATEGORY_NAME, guessCategory, normalize } from '../lib/categorize'
import { numpadToCents } from '../lib/numpad'
import { todayStr } from '../lib/dates'

interface Props {
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
  onSaved: (e: Expense) => void
}

export function AddExpenseSheet({ budgets, categories, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [manualCat, setManualCat] = useState<string | null>(null)
  const [pickingCat, setPickingCat] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  const suggestions = useLiveQuery(() => suggestDescriptions(desc), [desc]) ?? []
  const history = useLiveQuery(() => db.descriptions.get(normalize(desc)), [desc])

  const fallback = categories.find((c) => c.name === FALLBACK_CATEGORY_NAME) ?? categories[categories.length - 1]
  const autoCatId = useMemo(() => guessCategory(desc, categories, history) ?? fallback?.id, [desc, categories, history, fallback])
  const catId = manualCat ?? autoCatId
  const category = categories.find((c) => c.id === catId)

  const cents = numpadToCents(amount)

  useEffect(() => setManualCat(null), [desc]) // ndryshimi i përshkrimit rifillon auto-kategorinë

  async function save(budgetId: string) {
    if (cents <= 0 || !catId || saving) return
    setSaving(true)
    const e = await addExpense({ amount: cents, description: desc, budgetId, categoryId: catId, date })
    onSaved(e)
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

        <div className="mt-auto flex flex-col gap-3">
          <NumPad value={amount} onChange={setAmount} />
          <div className="grid gap-2 px-4" style={{ gridTemplateColumns: `repeat(${Math.min(budgets.length, 2)}, 1fr)` }}>
            {budgets.map((b) => (
              <button
                key={b.id}
                disabled={cents <= 0 || saving}
                onClick={() => save(b.id)}
                className="h-16 rounded-2xl text-xl font-bold text-slate-900 transition active:scale-[0.98] disabled:opacity-35"
                style={{ background: b.color }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
