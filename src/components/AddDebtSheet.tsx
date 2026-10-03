import { useState } from 'react'
import { Sheet } from './Sheet'
import { addDebt } from '../db/actions'
import type { Budget, DebtDirection, Person } from '../db/schema'
import { parseAmount } from '../lib/money'
import { todayStr } from '../lib/dates'

interface Props {
  budgets: Budget[]
  people: Person[]
  onClose: () => void
}

export function AddDebtSheet({ budgets, people, onClose }: Props) {
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me')
  const [personId, setPersonId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState('')
  const [budgetId, setBudgetId] = useState<string>(budgets[1]?.id ?? budgets[0].id) // zakonisht nga paratë personale
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const cents = parseAmount(amount) ?? 0
  const who = personId ? (people.find((p) => p.id === personId)?.name ?? '') : name.trim()
  const lent = direction === 'owed_to_me'

  async function save() {
    try {
      await addDebt({ direction, counterparty: who, personId: personId ?? undefined, amount: cents, date, dueDate: dueDate || undefined, note, budgetId: budgetId || undefined })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const seg = (on: boolean) => `h-14 rounded-2xl px-3 text-sm font-semibold leading-tight ${on ? 'bg-white text-slate-900' : 'bg-surface-2'}`

  return (
    <Sheet title="Borxh i ri" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDirection('owed_to_me')} className={seg(lent)}>I dhashë hua<span className="block text-xs font-normal opacity-70">më ka borxh</span></button>
          <button onClick={() => setDirection('i_owe')} className={seg(!lent)}>Mora hua<span className="block text-xs font-normal opacity-70">i kam borxh</span></button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">{lent ? 'Kujt ia dhe?' : 'Nga kush e more?'}</h3>
          <div className="flex flex-wrap gap-2">
            {people.filter((p) => !p.archived).map((p) => (
              <button key={p.id} onClick={() => { setPersonId(p.id); setName('') }} className={`rounded-full px-4 py-2 text-sm ${personId === p.id ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`}>
                {p.name}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setPersonId(null) }}
            placeholder={people.length ? 'ose shkruaj një emër tjetër' : 'Emri (p.sh. Arben)'}
            aria-label="Emri"
            className="mt-2 h-12 w-full rounded-2xl bg-surface-2 px-4 outline-none"
          />
        </div>

        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Shuma (€)" className="h-14 rounded-2xl bg-surface-2 px-4 text-2xl font-semibold outline-none" />

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Data</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-12 rounded-2xl bg-surface-2 px-3 outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Afati (opsional)</span>
            <input type="date" value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} aria-label="Afati" className="h-12 rounded-2xl bg-surface-2 px-3 outline-none" />
          </label>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">{lent ? 'Nga cilat para?' : 'Ku hynë paratë?'}</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${budgets.length + 1}, 1fr)` }}>
            {budgets.map((b) => (
              <button key={b.id} onClick={() => setBudgetId(b.id)} className="h-11 rounded-xl text-sm font-semibold" style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}>
                {b.name}
              </button>
            ))}
            <button onClick={() => setBudgetId('')} className={`h-11 rounded-xl text-xs font-semibold ${budgetId === '' ? 'bg-white text-slate-900' : 'bg-surface-2'}`}>Pa lëvizje</button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {budgetId
              ? `${lent ? 'Mbetja e' : 'Te'} ${budgets.find((b) => b.id === budgetId)?.name} ${lent ? 'zvogëlohet' : 'shtohet'} me këtë shumë. Nuk llogaritet si ${lent ? 'shpenzim' : 'e hyrë'}.`
              : 'Vetëm regjistrohet borxhi; buxhetet nuk preken (p.sh. për një borxh të vjetër).'}
          </p>
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shënim (opsional)" className="h-12 rounded-2xl bg-surface-2 px-4 outline-none" />

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button disabled={cents <= 0 || !who} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">Ruaj borxhin</button>
      </div>
    </Sheet>
  )
}
