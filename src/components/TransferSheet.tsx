import { useState } from 'react'
import { Sheet } from './Sheet'
import { addTransfer } from '../db/actions'
import type { Budget } from '../db/schema'
import type { BudgetSummary } from '../lib/calc'
import { formatEUR, parseAmount } from '../lib/money'
import { todayStr } from '../lib/dates'

interface Props {
  budgets: Budget[]
  summaries: BudgetSummary[]
  onClose: () => void
}

export function TransferSheet({ budgets, summaries, onClose }: Props) {
  const [from, setFrom] = useState(budgets[1]?.id ?? budgets[0].id)
  const [to, setTo] = useState(budgets.find((b) => b.id !== budgets[1]?.id)?.id ?? budgets[0].id)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const cents = parseAmount(amount) ?? 0
  const fromLeft = summaries.find((s) => s.budgetId === from)?.remaining ?? 0
  const over = cents > fromLeft

  async function save() {
    await addTransfer({ fromBudgetId: from, toBudgetId: to, amount: cents, note, date: todayStr() })
    onClose()
  }

  const picker = (label: string, value: string, set: (id: string) => void) => (
    <div>
      <div className="mb-1.5 text-sm text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {budgets.map((b) => (
          <button
            key={b.id}
            onClick={() => set(b.id)}
            className="h-11 rounded-xl px-4 font-semibold"
            style={value === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <Sheet title="Transferim midis buxheteve" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        {picker('Nga', from, setFrom)}
        {picker('Te', to, setTo)}
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Shuma (€)"
          className="h-14 rounded-2xl bg-surface-2 px-4 text-2xl font-semibold outline-none"
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shënim (opsionale)" className="h-12 rounded-2xl bg-surface-2 px-4 outline-none" />
        {from === to && <p className="text-sm text-danger">Zgjidh dy buxhete të ndryshme.</p>}
        {from !== to && over && cents > 0 && (
          <p className="text-sm text-amber-400">Në këtë buxhet kanë mbetur vetëm {formatEUR(fromLeft)}; transferimi e çon në minus.</p>
        )}
        <button disabled={cents <= 0 || from === to} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
          Transfero
        </button>
      </div>
    </Sheet>
  )
}
