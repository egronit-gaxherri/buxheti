import type { Budget, Income, IncomeSplit, Transfer } from '../db/schema'
import { deleteIncome, deleteTransfer } from '../db/actions'
import { formatEUR } from '../lib/money'
import { formatDateSQ } from '../lib/dates'

interface Props {
  budgets: Budget[]
  incomes: Income[]
  splits: IncomeSplit[]
  transfers: Transfer[]
  onAddIncome: () => void
  onAddTransfer: () => void
}

/** Të hyrat dhe transferimet e muajit. */
export function MovesPage({ budgets, incomes, splits, transfers, onAddIncome, onAddTransfer }: Props) {
  const bud = (id: string) => budgets.find((b) => b.id === id)
  const total = incomes.reduce((a, i) => a + i.amount, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onAddIncome} className="h-14 rounded-2xl bg-ok/90 font-semibold text-slate-900">+ Të hyra</button>
        <button onClick={onAddTransfer} className="h-14 rounded-2xl bg-surface-2 font-semibold">⇄ Transferim</button>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold">Të hyra</h2>
          <span className="tabnum text-sm font-semibold text-ok">{formatEUR(total, { sign: true })}</span>
        </div>
        {incomes.length === 0 && <p className="py-4 text-center text-muted">Asnjë e hyrë këtë muaj.</p>}
        <ul className="space-y-2">
          {incomes.map((i) => (
            <li key={i.id} className="rounded-2xl bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{i.source}</span>
                <span className="tabnum font-semibold text-ok">{formatEUR(i.amount, { sign: true })}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{formatDateSQ(i.date)}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {splits.filter((s) => s.incomeId === i.id).map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ background: bud(s.budgetId)?.color }} />
                    {bud(s.budgetId)?.name} {formatEUR(s.amount)}
                  </span>
                ))}
              </div>
              <button
                onClick={() => confirm(`Të fshihet "${i.source}" ${formatEUR(i.amount)}?`) && deleteIncome(i.id)}
                className="mt-3 text-xs text-red-400"
              >
                Fshi
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-lg font-semibold">Transferime</h2>
        {transfers.length === 0 && <p className="py-4 text-center text-muted">Asnjë transferim këtë muaj.</p>}
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {[...transfers].sort((a, b) => b.createdAt - a.createdAt).map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-surface-2">⇄</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{bud(t.fromBudgetId)?.name} → {bud(t.toBudgetId)?.name}</div>
                <div className="truncate text-xs text-muted">{formatDateSQ(t.date)}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <span className="tabnum font-semibold">{formatEUR(t.amount)}</span>
              <button onClick={() => confirm('Të fshihet transferimi?') && deleteTransfer(t.id)} aria-label="Fshi transferimin" className="px-1 text-muted">✕</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
