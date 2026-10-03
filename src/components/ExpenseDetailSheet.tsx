import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { deleteExpense, updateExpense } from '../db/actions'
import type { Budget, Category, Expense } from '../db/schema'
import { formatEUR } from '../lib/money'
import { formatDateSQ } from '../lib/dates'

interface Props {
  expense: Expense
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
}

export function ExpenseDetailSheet({ expense, budgets, categories, onClose }: Props) {
  const [note, setNote] = useState(expense.note ?? '')
  const [categoryId, setCategoryId] = useState(expense.categoryId)
  const [receipt, setReceipt] = useState<Blob | undefined>(expense.receipt)
  const [url, setUrl] = useState<string>()
  const budget = budgets.find((b) => b.id === expense.budgetId)

  useEffect(() => {
    if (!receipt) return setUrl(undefined)
    const u = URL.createObjectURL(receipt)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [receipt])

  async function save() {
    await updateExpense(expense.id, { note: note.trim() || undefined, categoryId, receipt })
    onClose()
  }

  async function remove() {
    if (!confirm('Të fshihet ky shpenzim?')) return
    await deleteExpense(expense.id)
    onClose()
  }

  return (
    <Sheet title={expense.description || 'Shpenzim'} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="tabnum text-4xl font-bold">−{formatEUR(expense.amount)}</div>
          <div className="mt-1 text-sm text-muted">
            {budget?.name} · {formatDateSQ(expense.date)}
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
        {url && <img src={url} alt="Fatura" className="max-h-64 w-full rounded-2xl object-contain bg-black" />}
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-surface-2 font-medium">
          {receipt ? '📷 Ndrysho foton e faturës' : '📷 Shto foto të faturës'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? receipt)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={remove} className="h-14 rounded-2xl bg-red-500/15 font-semibold text-red-400">Fshi</button>
          <button onClick={save} className="h-14 rounded-2xl bg-white font-bold text-slate-900">Ruaj</button>
        </div>
      </div>
    </Sheet>
  )
}
