import { useMemo, useState } from 'react'
import type { Budget, Category, Expense } from '../db/schema'
import { formatEUR } from '../lib/money'
import { formatDateSQ, weekdaySQ } from '../lib/dates'
import { normalize } from '../lib/categorize'

interface Props {
  expenses: Expense[]
  budgets: Budget[]
  categories: Category[]
  onSelect: (e: Expense) => void
  filters?: boolean
}

export function ExpenseList({ expenses, budgets, categories, onSelect, filters = true }: Props) {
  const [budgetId, setBudgetId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const nq = normalize(q)
    const filtered = expenses.filter(
      (e) =>
        (!budgetId || e.budgetId === budgetId) &&
        (!categoryId || e.categoryId === categoryId) &&
        (!nq || normalize(`${e.description} ${e.note ?? ''}`).includes(nq)),
    )
    const byDay = new Map<string, Expense[]>()
    for (const e of filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)) {
      byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
    }
    return [...byDay.entries()]
  }, [expenses, budgetId, categoryId, q])

  const cat = (id: string) => categories.find((c) => c.id === id)
  const bud = (id: string) => budgets.find((b) => b.id === id)
  const chip = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-sky-400 text-slate-900' : 'bg-surface-2 text-white/90'}`

  return (
    <div>
      {filters && (
        <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg/95 px-4 pb-3 pt-1 backdrop-blur">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Kërko shpenzime…"
            className="h-11 w-full rounded-2xl bg-surface px-4 outline-none placeholder:text-muted"
          />
          <div className="flex gap-2 overflow-x-auto">
            <button className={chip(!budgetId)} onClick={() => setBudgetId(null)}>Të gjitha</button>
            {budgets.map((b) => (
              <button key={b.id} className={chip(budgetId === b.id)} onClick={() => setBudgetId(budgetId === b.id ? null : b.id)}>
                {b.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button key={c.id} className={chip(categoryId === c.id)} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 && <p className="py-10 text-center text-muted">Asnjë shpenzim këtu.</p>}

      {groups.map(([date, items]) => (
        <section key={date} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-sm font-medium text-muted">
              Blerjet me datën {formatDateSQ(date)} <span className="text-muted/70">· {weekdaySQ(date)}</span>
            </h3>
            <span className="tabnum text-sm font-semibold text-white/90">{formatEUR(items.reduce((a, e) => a + e.amount, 0))}</span>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {items.map((e) => (
              <li key={e.id}>
                <button onClick={() => onSelect(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-lg">{cat(e.categoryId)?.icon ?? '📦'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.description || cat(e.categoryId)?.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="size-2 rounded-full" style={{ background: bud(e.budgetId)?.color }} />
                      {bud(e.budgetId)?.name} · {cat(e.categoryId)?.name}
                      {e.receipt && ' · 📎'}
                    </span>
                  </span>
                  <span className="tabnum font-semibold">−{formatEUR(e.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
