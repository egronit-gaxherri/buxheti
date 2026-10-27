import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { deleteExpense, updateExpense } from '../db/actions'
import type { Budget, Category, Expense } from '../db/schema'
import { formatEUR, parseAmount } from '../lib/money'

interface Props {
  expense: Expense
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
}

const toText = (c: number) => (c / 100).toFixed(2).replace('.', ',').replace(',00', '')

export function ExpenseDetailSheet({ expense, budgets, categories, onClose }: Props) {
  const [amountText, setAmountText] = useState(toText(expense.amount))
  const [description, setDescription] = useState(expense.description)
  const [budgetId, setBudgetId] = useState(expense.budgetId)
  const [date, setDate] = useState(expense.date)
  const [note, setNote] = useState(expense.note ?? '')
  const [categoryId, setCategoryId] = useState(expense.categoryId)
  const [receipt, setReceipt] = useState<Blob | undefined>(expense.receipt)
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!receipt) return setUrl(undefined)
    const u = URL.createObjectURL(receipt)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [receipt])

  const cents = parseAmount(amountText) ?? 0

  async function save() {
    setError('')
    try {
      await updateExpense(expense.id, {
        amount: cents,
        description,
        budgetId,
        date,
        note: note.trim() || undefined,
        categoryId,
        receipt,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove() {
    if (!confirm('Të fshihet ky shpenzim?')) return
    await deleteExpense(expense.id)
    onClose()
  }

  return (
    <Sheet title={expense.description || 'Ndrysho shpenzimin'} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Shuma (€)</span>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              aria-label="Shuma (€)"
              className="tabnum h-12 rounded-2xl bg-surface-2 px-4 text-2xl font-bold outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Data"
              className="h-12 rounded-2xl bg-surface-2 px-3 text-sm outline-none"
            />
          </label>
        </div>

        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Përshkrimi (p.sh. Benzin)"
          aria-label="Përshkrimi"
          className="h-12 rounded-2xl bg-surface-2 px-4 outline-none"
        />

        <div>
          <div className="mb-1.5 text-xs text-muted">Paguar nga</div>
          <div className="flex gap-2">
            {budgets.map((b) => (
              <button
                key={b.id}
                onClick={() => setBudgetId(b.id)}
                className="h-11 flex-1 rounded-xl font-semibold"
                style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-surface-2)' }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategoryId(c.id)} className={`rounded-full px-3 py-1.5 text-sm ${c.id === categoryId ? 'bg-sky-400 text-slate-900' : 'bg-surface-2'}`}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Shënim…" className="rounded-2xl bg-surface-2 p-4 outline-none" />
        {url && (
          <div className="relative">
            <img src={url} alt="Fatura" className="max-h-64 w-full rounded-2xl bg-black object-contain" />
            <button onClick={() => setReceipt(undefined)} aria-label="Hiq foton" className="absolute right-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs text-red-300">
              Hiq foton
            </button>
          </div>
        )}
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-surface-2 font-medium">
          {receipt ? '📷 Ndrysho foton e faturës' : '📷 Shto foto të faturës'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? receipt)} />
        </label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={remove} className="h-14 rounded-2xl bg-red-500/15 font-semibold text-red-400">Fshi</button>
          <button disabled={cents <= 0} onClick={save} className="h-14 rounded-2xl bg-white font-bold text-slate-900 disabled:opacity-35">
            Ruaj · {formatEUR(cents)}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
