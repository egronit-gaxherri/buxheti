import { useState } from 'react'
import { Sheet } from './Sheet'
import { addIncome } from '../db/actions'
import type { Budget } from '../db/schema'
import { formatEUR, parseAmount } from '../lib/money'
import { todayStr } from '../lib/dates'
import { resolveSplits, type SplitRow } from '../lib/split'

const SOURCES = ['Rrogë', 'Edi', 'Tjetër']
const eur = (s: string) => parseAmount(s) ?? 0

/** Të hyra me ndarje mes buxheteve, me shumë (€) ose përqindje (%) për secilin. */
export function AddIncomeSheet({ budgets, onClose }: { budgets: Budget[]; onClose: () => void }) {
  const [source, setSource] = useState(SOURCES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<SplitRow[]>(budgets.map((b) => ({ budgetId: b.id, mode: 'eur', value: '' })))
  const [error, setError] = useState('')

  const total = eur(amount)
  const { amounts, unallocated } = resolveSplits(total, rows, eur)
  const ready = total > 0 && unallocated === 0

  const patch = (id: string, p: Partial<SplitRow>) => setRows((rs) => rs.map((r) => (r.budgetId === id ? { ...r, ...p } : r)))
  const allTo = (id: string) => setRows((rs) => rs.map((r) => (r.budgetId === id ? { ...r, mode: 'pct', value: '100' } : { ...r, value: '' })))
  /** Vendos në këtë rresht atë që mbetet pa ndarë (në €). */
  const fillRest = (id: string) => {
    const cur = amounts[id] ?? 0
    patch(id, { mode: 'eur', value: ((cur + unallocated) / 100).toFixed(2).replace('.', ',') })
  }

  async function save() {
    try {
      await addIncome({
        source,
        amount: total,
        date,
        splits: Object.entries(amounts).map(([budgetId, amount]) => ({ budgetId, amount })),
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
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
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Burimi" className="h-12 rounded-2xl bg-surface-2 px-4 text-lg outline-none" />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Shuma (€)"
          className="h-14 rounded-2xl bg-surface-2 px-4 text-2xl font-semibold outline-none"
        />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-12 rounded-2xl bg-surface-2 px-4 outline-none" />

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">Ndarja mes buxheteve</h3>
          <div className="space-y-2">
            {budgets.map((b) => {
              const r = rows.find((x) => x.budgetId === b.id)!
              return (
                <div key={b.id} className="rounded-2xl bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: b.color }} />
                    <span className="flex-1 font-medium">{b.name}</span>
                    <span className="tabnum text-sm text-muted">{formatEUR(amounts[b.id] ?? 0)}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={r.value}
                      onChange={(e) => patch(b.id, { value: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Shuma për ${b.name}`}
                      className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-lg outline-none"
                    />
                    <div className="flex overflow-hidden rounded-xl bg-bg text-sm">
                      {(['eur', 'pct'] as const).map((m) => (
                        <button key={m} onClick={() => patch(b.id, { mode: m })} className={`w-11 ${r.mode === m ? 'bg-white text-slate-900' : 'text-muted'}`}>
                          {m === 'eur' ? '€' : '%'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button onClick={() => allTo(b.id)} className="rounded-full bg-bg px-3 py-1.5">100% këtu</button>
                    <button onClick={() => fillRest(b.id)} disabled={total <= 0} className="rounded-full bg-bg px-3 py-1.5 disabled:opacity-40">Plotëso mbetjen</button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className={`mt-3 text-center text-sm ${total > 0 && unallocated === 0 ? 'text-ok' : 'text-muted'}`} role="status">
            {total <= 0
              ? 'Vendos shumën e të hyrës'
              : unallocated === 0
                ? '✓ E ndarë plotësisht'
                : unallocated > 0
                  ? `Pa ndarë: ${formatEUR(unallocated)}`
                  : `Tepër: ${formatEUR(-unallocated)}`}
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={!ready} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
          Ruaj
        </button>
      </div>
    </Sheet>
  )
}
