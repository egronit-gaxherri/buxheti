import { useState } from 'react'
import { setLimit } from '../db/actions'
import type { Category, Expense, Limit } from '../db/schema'
import { limitLevel } from '../lib/stats'
import { formatEUR, parseAmount } from '../lib/money'

interface Props {
  categories: Category[]
  limits: Limit[]
  expenses: Expense[] // të muajit të shfaqur
}

const COLOR = { ok: '#38bdf8', warn: '#fbbf24', over: 'var(--color-danger)' } as const

/** Limit mujor për kategori; alarm në 80% dhe 100%. */
export function LimitsPage({ categories, limits, expenses }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')

  const spentOf = (id: string) => expenses.filter((e) => e.categoryId === id).reduce((a, e) => a + e.amount, 0)

  async function save(id: string) {
    await setLimit(id, value.trim() === '' ? null : parseAmount(value))
    setEditing(null)
  }

  return (
    <div className="space-y-2">
      <p className="px-1 pb-2 text-sm text-muted">Vendos sa mund të shpenzosh në muaj për kategori. Do të të paralajmëroj në 80% dhe në 100%.</p>
      {categories.map((c) => {
        const lim = limits.find((l) => l.categoryId === c.id)
        const spent = spentOf(c.id)
        const level = lim ? limitLevel(spent, lim.amount) : 'ok'
        const pct = lim ? Math.min(100, (spent / lim.amount) * 100) : 0
        return (
          <div key={c.id} className="rounded-2xl bg-surface p-4">
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => {
                setEditing(editing === c.id ? null : c.id)
                setValue(lim ? (lim.amount / 100).toFixed(2).replace('.', ',') : '')
              }}
            >
              <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-lg">{c.icon}</span>
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="tabnum text-sm text-muted">
                {lim ? `${formatEUR(spent)} / ${formatEUR(lim.amount)}` : spent > 0 ? formatEUR(spent) : 'Pa limit'}
              </span>
            </button>
            {lim && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR[level] }} />
              </div>
            )}
            {lim && level !== 'ok' && (
              <p className="mt-2 text-xs" style={{ color: COLOR[level] }}>
                {level === 'over' ? `Ke kaluar limitin me ${formatEUR(spent - lim.amount)}` : `Ke arritur ${Math.round((spent / lim.amount) * 100)}% të limitit`}
              </p>
            )}
            {editing === c.id && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="Limiti mujor €  (bosh = pa limit)"
                  aria-label={`Limiti për ${c.name}`}
                  className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 outline-none"
                />
                <button onClick={() => save(c.id)} className="rounded-xl bg-white px-5 font-semibold text-slate-900">Ruaj</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
