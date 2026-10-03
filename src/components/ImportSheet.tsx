import { useState } from 'react'
import { Sheet } from './Sheet'
import { db } from '../db/db'
import { importExpenses } from '../db/actions'
import type { Budget, Category, Expense } from '../db/schema'
import { FALLBACK_CATEGORY_NAME, guessCategory, normalize } from '../lib/categorize'
import { isDuplicate, parseNotes, type SkippedLine } from '../lib/notesParser'
import { formatEUR, parseAmount } from '../lib/money'
import { formatDateSQ, todayStr } from '../lib/dates'

interface Row {
  key: number
  include: boolean
  date: string
  dateGuessed: boolean
  description: string
  amountText: string
  categoryId: string
  budgetId: string
  dup: boolean
}

interface Props {
  budgets: Budget[]
  categories: Category[]
  onClose: () => void
  onImported: (expenses: Expense[]) => void
}

/** Ngjit tekstin nga Apple Notes → pamje paraprake e redaktueshme → ruaj. */
export function ImportSheet({ budgets, categories, onClose, onImported }: Props) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [skipped, setSkipped] = useState<SkippedLine[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fallback = categories.find((c) => c.name === FALLBACK_CATEGORY_NAME) ?? categories[0]
  const cat = (id: string) => categories.find((c) => c.id === id)

  async function paste() {
    try {
      setText(await navigator.clipboard.readText())
    } catch {
      setError('Safari nuk lejoi leximin e clipboard-it. Ngjite tekstin me dorë në kuti.')
    }
  }

  async function analyze() {
    setError('')
    const res = parseNotes(text, todayStr())
    if (res.items.length === 0) {
      setError('Nuk gjeta asnjë shpenzim me shumë. Kontrollo formatin (p.sh. "Buk 3 euro").')
      return
    }
    const dates = [...new Set(res.items.map((i) => i.date))]
    const existing = await db.expenses.where('date').anyOf(dates).toArray()
    const next: Row[] = []
    for (const [n, it] of res.items.entries()) {
      const norm = normalize(it.description)
      const hist = norm ? await db.descriptions.get(norm) : undefined
      const dup = isDuplicate(it, existing)
      next.push({
        key: n,
        include: !dup,
        date: it.date,
        dateGuessed: it.dateGuessed,
        description: it.description,
        amountText: (it.amount / 100).toFixed(2).replace('.', ','),
        categoryId: guessCategory(it.description, categories, hist) ?? fallback.id,
        budgetId: hist && budgets.some((b) => b.id === hist.lastBudgetId) ? hist.lastBudgetId : budgets[0].id,
        dup,
      })
    }
    setRows(next)
    setSkipped(res.skipped)
  }

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const chosen = rows?.filter((r) => r.include && (parseAmount(r.amountText) ?? 0) > 0) ?? []
  const total = chosen.reduce((a, r) => a + (parseAmount(r.amountText) ?? 0), 0)

  async function save() {
    setBusy(true)
    try {
      const made = await importExpenses(
        chosen.map((r) => ({ amount: parseAmount(r.amountText)!, description: r.description, budgetId: r.budgetId, categoryId: r.categoryId, date: r.date })),
      )
      onImported(made)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!rows) {
    return (
      <Sheet title="Import nga shënimet" onClose={onClose}>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted">Kopjo tekstin nga Apple Notes dhe ngjite këtu. Çdo rresht me datë (p.sh. "Blerjet me datën 02.10.2026") vlen për rreshtat pas tij.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'Blerjet me datën 02.10.2026\nEtc junik -mami 20 euro\nBuk 3 euro'}
            className="rounded-2xl bg-surface-2 p-4 font-mono text-sm outline-none"
            aria-label="Teksti i shënimeve"
          />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button onClick={paste} className="h-12 rounded-2xl bg-surface-2 font-medium">📋 Ngjit nga clipboard</button>
          <button disabled={!text.trim()} onClick={analyze} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">Analizo</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={`Pamje paraprake · ${rows.length} rreshta`} onClose={onClose}>
      <div className="flex flex-col gap-3 p-4 pb-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Të gjitha te:</span>
          {budgets.map((b) => (
            <button key={b.id} onClick={() => setRows(rows.map((r) => ({ ...r, budgetId: b.id })))} className="rounded-full px-3 py-1.5 font-medium text-slate-900" style={{ background: b.color }}>
              {b.name}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {rows.map((r) => {
            const bad = r.include && (parseAmount(r.amountText) ?? 0) <= 0
            return (
              <li key={r.key} className={`rounded-2xl bg-surface-2 p-3 ${r.include ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} aria-label="Përfshi" className="size-5 accent-sky-400" />
                  <input value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} placeholder="(pa përshkrim)" aria-label="Përshkrimi" className="h-10 min-w-0 flex-1 rounded-xl bg-bg px-3 outline-none" />
                  <input
                    value={r.amountText}
                    onChange={(e) => patch(r.key, { amountText: e.target.value })}
                    inputMode="decimal"
                    aria-label="Shuma"
                    className={`h-10 w-20 rounded-xl bg-bg px-2 text-right outline-none ${bad ? 'ring-1 ring-danger' : ''}`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <input type="date" value={r.date} onChange={(e) => e.target.value && patch(r.key, { date: e.target.value, dateGuessed: false })} aria-label="Data" className="h-8 rounded-lg bg-bg px-2" />
                  <select value={r.categoryId} onChange={(e) => patch(r.key, { categoryId: e.target.value })} aria-label="Kategoria" className="h-8 rounded-lg bg-bg px-2">
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  {budgets.map((b) => (
                    <button key={b.id} onClick={() => patch(r.key, { budgetId: b.id })} className="h-8 rounded-lg px-3 font-medium" style={r.budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-bg)' }}>
                      {b.name}
                    </button>
                  ))}
                </div>
                {(r.dup || r.dateGuessed) && (
                  <p className="mt-2 text-xs text-amber-300">
                    {r.dup && 'Mund të jetë i dyfishtë (ekziston i njëjti shpenzim). '}
                    {r.dateGuessed && `Pa datë në shënime — u vendos ${formatDateSQ(r.date)}.`}
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        {skipped.length > 0 && (
          <details className="rounded-2xl bg-surface-2 p-3 text-sm">
            <summary className="cursor-pointer text-muted">{skipped.length} rreshta u anashkaluan</summary>
            <ul className="mt-2 space-y-1">
              {skipped.map((s) => (
                <li key={s.line} className="text-xs text-muted">
                  #{s.line} “{s.raw.trim()}” — {s.reason === 'total' ? 'rresht totali' : 'pa shumë'}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button onClick={() => setRows(null)} className="h-14 rounded-2xl bg-surface-2 px-5">Prapa</button>
          <button disabled={chosen.length === 0 || busy} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">
            Ruaj {chosen.length} shpenzime · {formatEUR(total)}
          </button>
        </div>
        <p className="text-center text-xs text-muted">{cat(rows[0].categoryId)?.icon} Kategoritë zgjidhen automatikisht; mund t’i ndryshosh para ruajtjes.</p>
      </div>
    </Sheet>
  )
}
