import { useState } from 'react'
import { addRecurring, deleteRecurring, setRecurringActive, updateRecurring } from '../db/actions'
import type { Budget, Category, Recurring } from '../db/schema'
import { FALLBACK_CATEGORY_NAME, guessCategory } from '../lib/categorize'
import { formatEUR, parseAmount } from '../lib/money'

interface Props {
  budgets: Budget[]
  categories: Category[]
  items: Recurring[]
}

const toText = (c: number) => (c / 100).toFixed(2).replace('.', ',').replace(',00', '')

/** Shpenzime që shtohen vetë çdo muaj (qira, fatura, internet). */
export function RecurringPage({ budgets, categories, items }: Props) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [budgetId, setBudgetId] = useState(budgets[0].id)
  const [catId, setCatId] = useState<string | null>(null)

  const fallback = categories.find((c) => c.name === FALLBACK_CATEGORY_NAME) ?? categories[0]
  const effectiveCat = catId ?? guessCategory(desc, categories) ?? fallback.id
  const cents = parseAmount(amount) ?? 0
  const dayNum = Number(day)
  const valid = cents > 0 && desc.trim() !== '' && dayNum >= 1 && dayNum <= 31

  function resetForm() {
    setAdding(false)
    setEditingId(null)
    setDesc('')
    setAmount('')
    setDay('1')
    setBudgetId(budgets[0].id)
    setCatId(null)
  }

  function startEdit(r: Recurring) {
    setEditingId(r.id)
    setAdding(true)
    setDesc(r.description)
    setAmount(toText(r.amount))
    setDay(String(r.dayOfMonth))
    setBudgetId(r.budgetId)
    setCatId(r.categoryId)
  }

  async function save() {
    const payload = { budgetId, categoryId: effectiveCat, amount: cents, description: desc, dayOfMonth: dayNum }
    if (editingId) await updateRecurring(editingId, payload)
    else await addRecurring(payload)
    resetForm()
  }

  const bud = (id: string) => budgets.find((b) => b.id === id)
  const cat = (id: string) => categories.find((c) => c.id === id)

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-muted">Këto shpenzime shtohen automatikisht në datën e caktuar çdo muaj (kur e hap aplikacionin).</p>

      {!adding ? (
        <button onClick={() => setAdding(true)} className="h-12 w-full rounded-2xl border border-dashed border-line text-muted active:bg-surface">+ Shto të përsëritur</button>
      ) : (
        <div className="space-y-3 rounded-2xl bg-surface p-4">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Përshkrimi (p.sh. Qira)" className="h-12 w-full rounded-xl bg-surface-2 px-4 outline-none" />
          <div className="flex gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Shuma €" className="h-12 min-w-0 flex-1 rounded-xl bg-surface-2 px-4 outline-none" />
            <input value={day} onChange={(e) => setDay(e.target.value)} inputMode="numeric" aria-label="Dita e muajit" placeholder="Dita" className="h-12 w-20 rounded-xl bg-surface-2 px-4 text-center outline-none" />
          </div>
          <div className="text-xs text-muted">Dita e muajit (1–31)</div>
          <div className="flex gap-2">
            {budgets.map((b) => (
              <button key={b.id} onClick={() => setBudgetId(b.id)} className="h-11 flex-1 rounded-xl font-semibold" style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}>
                {b.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCatId(c.id)} className={`rounded-full px-3 py-1.5 text-sm ${c.id === effectiveCat ? 'bg-sky-400 text-slate-900' : 'bg-surface-2'}`}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={resetForm} className="h-12 rounded-xl bg-surface-2">Anulo</button>
            <button disabled={!valid} onClick={save} className="h-12 rounded-xl bg-white font-bold text-slate-900 disabled:opacity-35">
              {editingId ? 'Përditëso' : 'Ruaj'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !adding && <p className="py-6 text-center text-muted">Asnjë shpenzim i përsëritur.</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className={`flex items-center gap-3 rounded-2xl bg-surface p-4 ${r.active ? '' : 'opacity-50'}`}>
            <span className="grid size-10 place-items-center rounded-full bg-surface-2">{cat(r.categoryId)?.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.description}</div>
              <div className="text-xs text-muted">
                Çdo {r.dayOfMonth} · {bud(r.budgetId)?.name}
              </div>
            </div>
            <span className="tabnum font-semibold">{formatEUR(r.amount)}</span>
            <div className="flex flex-col items-end gap-1 text-xs">
              <div className="flex gap-2">
                <button onClick={() => startEdit(r)} className="text-muted">Ndrysho</button>
                <button onClick={() => setRecurringActive(r.id, !r.active)} className="text-sky-300">{r.active ? 'Pusho' : 'Aktivizo'}</button>
              </div>
              <button onClick={() => confirm(`Të fshihet "${r.description}"?`) && deleteRecurring(r.id)} className="text-red-400">Fshi</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
