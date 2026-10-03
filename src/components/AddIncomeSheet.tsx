import { useState } from 'react'
import { Sheet } from './Sheet'
import { addIncome, addPerson } from '../db/actions'
import { useAllIncomes, usePeople } from '../db/hooks'
import type { Budget } from '../db/schema'
import { formatEUR, parseAmount } from '../lib/money'
import { todayStr } from '../lib/dates'
import { resolveSplits, type SplitRow } from '../lib/split'
import { lastDestination, ME } from '../lib/people'

const eur = (s: string) => parseAmount(s) ?? 0
type Dest = string | 'split' // budgetId ose ndarje

interface Props {
  budgets: Budget[]
  onClose: () => void
  /** Hap fletën me këtë person të zgjedhur (p.sh. nga faqja Personat). */
  initialPerson?: string
  /** Personi që përfaqëson këtë anëtar në familje (= "Unë"). */
  meId?: string
}

/**
 * Të hyra: KUSH i dha (unë / një person) dhe KU shkojnë (Shtëpi, Personal ose të ndara).
 * Ndarja e fundit e secilit person parazgjidhet.
 */
export function AddIncomeSheet({ budgets, onClose, initialPerson, meId }: Props) {
  const people = usePeople()
  const all = useAllIncomes()
  const [who, setWho] = useState<string | null>(null) // null = ende pa zgjedhur → parazgjedhja
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayStr())
  const [dest, setDest] = useState<Dest | null>(null)
  const [rows, setRows] = useState<SplitRow[]>(budgets.map((b) => ({ budgetId: b.id, mode: 'eur', value: '' })))
  const [error, setError] = useState('')

  if (!people || !all) return null
  const active = people.filter((p) => !p.archived && p.id !== meId)
  const person = (key: string) => people.find((p) => p.id === key)

  /** Kur zgjidhet personi, parazgjidh ku shkuan paratë e tij herën e fundit. */
  function choose(key: string) {
    setWho(key)
    const last = lastDestination(key, all!.incomes, all!.splits, meId)
    if (last?.kind === 'budget') setDest(last.budgetId)
    else if (last?.kind === 'split') {
      setDest('split')
      setRows(budgets.map((b) => ({ budgetId: b.id, mode: 'pct', value: last.percents[b.id] ?? '' })))
    } else setDest(key === ME ? 'split' : budgets[0].id) // personat zakonisht japin për shtëpi
  }
  if (who === null) {
    choose(initialPerson ?? ME)
    return null
  }

  const total = eur(amount)
  const { amounts, unallocated } = dest === 'split' ? resolveSplits(total, rows, eur) : { amounts: dest ? { [dest]: total } : {}, unallocated: dest ? 0 : total }
  const ready = total > 0 && unallocated === 0

  const patch = (id: string, p: Partial<SplitRow>) => setRows((rs) => rs.map((r) => (r.budgetId === id ? { ...r, ...p } : r)))
  const fillRest = (id: string) => patch(id, { mode: 'eur', value: (((amounts[id] ?? 0) + unallocated) / 100).toFixed(2).replace('.', ',') })

  async function createPerson() {
    try {
      const p = await addPerson(newName)
      setNewName('')
      setAdding(false)
      choose(p.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save() {
    try {
      await addIncome({
        source: who === ME ? 'Rrogë' : (person(who!)?.name ?? 'Të hyra'),
        personId: who === ME ? undefined : who!,
        note,
        amount: total,
        date,
        splits: Object.entries(amounts).map(([budgetId, amount]) => ({ budgetId, amount })),
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const chip = (on: boolean) => `rounded-full px-4 py-2 text-sm font-medium ${on ? 'bg-white text-slate-900' : 'bg-surface-2'}`

  return (
    <Sheet title="Të hyra të reja" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">Kush i dha?</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => choose(ME)} className={chip(who === ME)}>🙋 Unë (rrogë)</button>
            {active.map((p) => (
              <button key={p.id} onClick={() => choose(p.id)} className={chip(who === p.id)}>
                <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
            {!adding && <button onClick={() => setAdding(true)} className="rounded-full border border-dashed border-line px-4 py-2 text-sm text-muted">+ Person i ri</button>}
          </div>
          {adding && (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPerson()}
                placeholder="Emri (p.sh. Mami)"
                aria-label="Emri i personit të ri"
                className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 outline-none"
              />
              <button onClick={createPerson} disabled={!newName.trim()} className="rounded-xl bg-white px-4 font-semibold text-slate-900 disabled:opacity-35">Shto</button>
            </div>
          )}
        </div>

        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Shuma (€)"
          className="h-14 rounded-2xl bg-surface-2 px-4 text-2xl font-semibold outline-none"
        />

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">Ku shkojnë paratë?</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${budgets.length + 1}, 1fr)` }}>
            {budgets.map((b) => (
              <button
                key={b.id}
                onClick={() => setDest(b.id)}
                className="h-12 rounded-2xl font-semibold"
                style={dest === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}
              >
                {b.name}
              </button>
            ))}
            <button onClick={() => setDest('split')} className={`h-12 rounded-2xl font-semibold ${dest === 'split' ? 'bg-white text-slate-900' : 'bg-surface-2'}`}>Ndaj</button>
          </div>
        </div>

        {dest === 'split' && (
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
                    <button onClick={() => fillRest(b.id)} disabled={total <= 0} className="rounded-xl bg-bg px-3 text-xs disabled:opacity-40">Mbetja</button>
                  </div>
                </div>
              )
            })}
            <p className={`text-center text-sm ${total > 0 && unallocated === 0 ? 'text-ok' : 'text-muted'}`} role="status">
              {total <= 0 ? 'Vendos shumën' : unallocated === 0 ? '✓ E ndarë plotësisht' : unallocated > 0 ? `Pa ndarë: ${formatEUR(unallocated)}` : `Tepër: ${formatEUR(-unallocated)}`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shënim (p.sh. dhuratë)" className="h-12 min-w-0 rounded-2xl bg-surface-2 px-4 outline-none" />
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data" className="h-12 rounded-2xl bg-surface-2 px-3 outline-none" />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={!ready} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
          {ready && dest !== 'split' ? `Ruaj · ${formatEUR(total)} → ${budgets.find((b) => b.id === dest)?.name}` : 'Ruaj'}
        </button>
      </div>
    </Sheet>
  )
}
