import { useState } from 'react'
import { Sheet } from './Sheet'
import { addDebtPayment, deleteDebt, deleteDebtPayment, setDebtSettled } from '../db/actions'
import type { Budget, Debt } from '../db/schema'
import { daysUntilDue, debtStatus, directionLabel, paidOf, remainingOf } from '../lib/debts'
import { formatEUR, parseAmount } from '../lib/money'
import { formatDateSQ, todayStr } from '../lib/dates'

interface Props {
  debt: Debt
  budgets: Budget[]
  onClose: () => void
}

export function DebtDetailSheet({ debt, budgets, onClose }: Props) {
  const remaining = remainingOf(debt)
  const [amount, setAmount] = useState((remaining / 100).toFixed(2).replace('.', ','))
  const [budgetId, setBudgetId] = useState<string>(debt.budgetId ?? '')
  const [date, setDate] = useState(todayStr())
  const [error, setError] = useState('')
  const today = todayStr()
  const status = debtStatus(debt, today)
  const days = daysUntilDue(debt, today)
  const lent = debt.direction === 'owed_to_me'
  const bud = (id?: string) => budgets.find((b) => b.id === id)?.name
  const pct = Math.min(100, (paidOf(debt) / debt.amount) * 100)

  async function pay() {
    setError('')
    try {
      await addDebtPayment(debt.id, { amount: parseAmount(amount) ?? 0, date, budgetId: budgetId || undefined })
      setAmount('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={debt.counterparty} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lent ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{directionLabel(debt)}</span>
          <div className="tabnum mt-3 text-4xl font-bold">{formatEUR(remaining)}</div>
          <div className="text-sm text-muted">mbetur nga {formatEUR(debt.amount)} · {formatDateSQ(debt.date)}{debt.budgetId ? ` · ${bud(debt.budgetId)}` : ''}</div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
          {debt.dueDate && (
            <p className={`mt-2 text-sm ${status === 'overdue' ? 'text-red-300' : status === 'due-soon' ? 'text-amber-300' : 'text-muted'}`}>
              Afati: {formatDateSQ(debt.dueDate)}
              {status === 'settled' ? '' : days! < 0 ? ` · ka kaluar ${-days!} ${-days! === 1 ? 'ditë' : 'ditë'}` : days === 0 ? ' · sot' : days === 1 ? ' · nesër' : ` · edhe ${days} ditë`}
            </p>
          )}
          {debt.note && <p className="mt-1 text-sm text-muted">{debt.note}</p>}
        </div>

        {debt.payments.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Pagesat</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
              {debt.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1">
                    {formatDateSQ(p.date)}
                    <span className="text-muted"> · {p.budgetId ? `${lent ? 'në' : 'nga'} ${bud(p.budgetId)}` : 'pa lëvizje'}</span>
                  </span>
                  <span className="tabnum font-semibold">{formatEUR(p.amount)}</span>
                  <button onClick={() => confirm('Të fshihet kjo pagesë?') && run(() => deleteDebtPayment(debt.id, p.id))} aria-label="Fshi pagesën" className="px-1 text-muted">✕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!debt.settled && (
          <section className="space-y-2 rounded-2xl bg-surface-2 p-4">
            <h3 className="font-medium">{lent ? 'Më ktheu' : 'I ktheva'}</h3>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Shuma e pagesës" className="h-12 min-w-0 flex-1 rounded-xl bg-bg px-3 text-lg outline-none" />
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data e pagesës" className="h-12 rounded-xl bg-bg px-2 text-sm outline-none" />
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${budgets.length + 1}, 1fr)` }}>
              {budgets.map((b) => (
                <button key={b.id} onClick={() => setBudgetId(b.id)} className="h-10 rounded-xl text-sm font-semibold" style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-bg)' }}>
                  {b.name}
                </button>
              ))}
              <button onClick={() => setBudgetId('')} className={`h-10 rounded-xl text-xs font-semibold ${budgetId === '' ? 'bg-white text-slate-900' : 'bg-bg'}`}>Pa lëvizje</button>
            </div>
            <button onClick={pay} disabled={(parseAmount(amount) ?? 0) <= 0} className="h-12 w-full rounded-xl bg-white font-bold text-slate-900 disabled:opacity-35">
              Regjistro pagesën
            </button>
          </section>
        )}

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          {debt.settled ? (
            remaining > 0 && <button onClick={() => run(() => setDebtSettled(debt.id, false))} className="h-12 rounded-2xl bg-surface-2 text-sm">Rihape</button>
          ) : (
            <button onClick={() => confirm(`Ta mbyll borxhin pa pagesë? Mbetja ${formatEUR(remaining)} do të quhet e falur.`) && run(() => setDebtSettled(debt.id, true))} className="h-12 rounded-2xl bg-surface-2 text-sm">
              Mbyll (fale)
            </button>
          )}
          <button
            onClick={() => confirm('Të fshihet borxhi bashkë me pagesat dhe lëvizjet e tij në buxhet?') && run(() => deleteDebt(debt.id)).then(onClose)}
            className="h-12 rounded-2xl bg-red-500/15 text-sm font-semibold text-red-400"
          >
            Fshi borxhin
          </button>
        </div>
      </div>
    </Sheet>
  )
}
