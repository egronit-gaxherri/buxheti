import { useState } from 'react'
import { Sheet } from './Sheet'
import { addIncome } from '../db/actions'
import type { Budget } from '../db/schema'
import { parseAmount } from '../lib/money'
import { todayStr } from '../lib/dates'

const SOURCES = ['Rrogë', 'Edi', 'Tjetër']

/** Versioni i thjeshtë (faza 1): e gjithë e hyra në një buxhet. Faza 2 shton ndarjen mes buxheteve. */
export function AddIncomeSheet({ budgets, onClose }: { budgets: Budget[]; onClose: () => void }) {
  const [source, setSource] = useState(SOURCES[0])
  const [amount, setAmount] = useState('')
  const [budgetId, setBudgetId] = useState(budgets[0]?.id ?? '')
  const [date, setDate] = useState(todayStr())
  const cents = parseAmount(amount) ?? 0

  async function save() {
    await addIncome({ source, amount: cents, date, splits: [{ budgetId, amount: cents }] })
    onClose()
  }

  return (
    <Sheet title="Të hyra të reja" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button key={s} onClick={() => setSource(s)} className={`rounded-full px-4 py-2 ${source === s ? 'bg-sky-400 text-slate-900' : 'bg-surface-2'}`}>
              {s}
            </button>
          ))}
        </div>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Burimi"
          className="h-12 rounded-2xl bg-surface-2 px-4 text-lg outline-none"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Shuma (€)"
          className="h-14 rounded-2xl bg-surface-2 px-4 text-2xl font-semibold outline-none"
        />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-12 rounded-2xl bg-surface-2 px-4 outline-none" />
        <div className="grid grid-cols-2 gap-2">
          {budgets.map((b) => (
            <button
              key={b.id}
              onClick={() => setBudgetId(b.id)}
              className="h-12 rounded-2xl font-semibold"
              style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}
            >
              {b.name}
            </button>
          ))}
        </div>
        <button disabled={cents <= 0} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
          Ruaj
        </button>
      </div>
    </Sheet>
  )
}
