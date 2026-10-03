import { useState } from 'react'
import type { Debt } from '../db/schema'
import { daysUntilDue, debtStatus, debtTotals, directionLabel, paidOf, remainingOf, sortDebts } from '../lib/debts'
import { formatEUR } from '../lib/money'
import { formatDateSQ, todayStr } from '../lib/dates'

interface Props {
  debts: Debt[]
  onAdd: () => void
  onOpen: (id: string) => void
}

export function dueText(d: Debt, today: string): string | null {
  const days = daysUntilDue(d, today)
  if (days == null) return null
  if (days < 0) return `ka kaluar afati ${-days} ditë`
  if (days === 0) return 'afati sot'
  if (days === 1) return 'afati nesër'
  return `afati ${formatDateSQ(d.dueDate!)}`
}

export function DebtsPage({ debts, onAdd, onOpen }: Props) {
  const [showSettled, setShowSettled] = useState(false)
  const today = todayStr()
  const t = debtTotals(debts)
  const list = sortDebts(debts.filter((d) => (debtStatus(d, today) === 'settled') === showSettled), today)
  const settledCount = debts.filter((d) => debtStatus(d, today) === 'settled').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-muted">Më kanë borxh</div>
          <div className="tabnum mt-1 text-xl font-bold text-emerald-300">{formatEUR(t.owedToMe)}</div>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-muted">U kam borxh</div>
          <div className="tabnum mt-1 text-xl font-bold text-red-300">{formatEUR(t.iOwe)}</div>
        </div>
      </div>
      {(t.owedToMe > 0 || t.iOwe > 0) && (
        <p className="px-1 text-center text-sm text-muted">
          Neto: <span className={t.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>{formatEUR(t.net, { sign: true })}</span>
        </p>
      )}

      <button onClick={onAdd} className="h-12 w-full rounded-2xl bg-white font-semibold text-slate-900">+ Borxh i ri</button>

      <div className="flex gap-2">
        <button onClick={() => setShowSettled(false)} className={`flex-1 rounded-full py-2 text-sm ${!showSettled ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`}>Aktive</button>
        <button onClick={() => setShowSettled(true)} className={`flex-1 rounded-full py-2 text-sm ${showSettled ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`}>Të shlyera ({settledCount})</button>
      </div>

      {list.length === 0 && <p className="py-8 text-center text-muted">{showSettled ? 'Asnjë borxh i shlyer.' : 'Asnjë borxh aktiv. 🎉'}</p>}
      <ul className="space-y-2">
        {list.map((d) => {
          const st = debtStatus(d, today)
          const due = dueText(d, today)
          const lent = d.direction === 'owed_to_me'
          return (
            <li key={d.id}>
              <button onClick={() => onOpen(d.id)} className="w-full rounded-2xl bg-surface p-4 text-left active:bg-surface-2">
                <div className="flex items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full text-lg ${lent ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>{lent ? '↗' : '↙'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.counterparty}</span>
                    <span className={`block text-xs ${lent ? 'text-emerald-300' : 'text-red-300'}`}>
                      {directionLabel(d)}
                      {due && st !== 'settled' && <span className={st === 'overdue' ? ' text-red-300' : st === 'due-soon' ? ' text-amber-300' : ' text-muted'}> · {due}</span>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabnum block font-semibold">{formatEUR(st === 'settled' ? d.amount : remainingOf(d))}</span>
                    {paidOf(d) > 0 && st !== 'settled' && <span className="tabnum text-xs text-muted">nga {formatEUR(d.amount)}</span>}
                  </span>
                </div>
                {paidOf(d) > 0 && st !== 'settled' && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(paidOf(d) / d.amount) * 100}%` }} />
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
