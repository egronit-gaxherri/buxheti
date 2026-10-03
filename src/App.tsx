import { useCallback, useEffect, useState } from 'react'
import { useBudgets, useCategories, useIncomes, useMonth, useRecurring } from './db/hooks'
import { undoExpense, remainingFor, runRecurring } from './db/actions'
import type { Expense } from './db/schema'
import { BudgetCard } from './components/BudgetCard'
import { ExpenseList } from './components/ExpenseList'
import { AddExpenseSheet } from './components/AddExpenseSheet'
import { AddIncomeSheet } from './components/AddIncomeSheet'
import { ExpenseDetailSheet } from './components/ExpenseDetailSheet'
import { UndoToast } from './components/UndoToast'
import { MovesPage } from './components/MovesPage'
import { RecurringPage } from './components/RecurringPage'
import { TransferSheet } from './components/TransferSheet'
import { currentMonthKey, formatMonthSQ, shiftMonth } from './lib/dates'
import { formatEUR } from './lib/money'

type Tab = 'home' | 'expenses' | 'moves' | 'recurring'

export default function App() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [tab, setTab] = useState<Tab>('home')
  const [sheet, setSheet] = useState<'expense' | 'income' | 'transfer' | null>(null)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [toast, setToast] = useState<{ expense: Expense; message: string; n: number } | null>(null)

  const budgets = useBudgets()
  const categories = useCategories()
  const { data, summaries } = useMonth(monthKey)
  const incomes = useIncomes(monthKey)
  const recurring = useRecurring()

  // Shto shpenzimet e përsëritura kur hapet aplikacioni dhe kur kthehet në plan të parë
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && runRecurring()
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [])

  const expireToast = useCallback(() => setToast(null), [])

  if (!budgets || !categories || !data || !summaries || !incomes || !recurring) return null

  async function onSaved(e: Expense) {
    setSheet(null)
    const left = await remainingFor(e.budgetId, e.monthKey)
    const name = budgets!.find((b) => b.id === e.budgetId)?.name
    const message = left >= 0 ? `Në ${name} kanë mbetur ${formatEUR(left)}` : `${name} ka kaluar buxhetin me ${formatEUR(-left)}`
    setToast({ expense: e, message, n: Date.now() })
  }

  async function onUndo() {
    if (!toast) return
    await undoExpense(toast.expense)
    setToast(null)
  }

  const isCurrent = monthKey === currentMonthKey()

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={() => setMonthKey(shiftMonth(monthKey, -1))} className="grid size-10 place-items-center rounded-full bg-surface text-lg" aria-label="Muaji i kaluar">‹</button>
        <button onClick={() => setMonthKey(currentMonthKey())} className="text-lg font-semibold">
          {formatMonthSQ(monthKey)}
        </button>
        <button onClick={() => setMonthKey(shiftMonth(monthKey, 1))} disabled={isCurrent} className="grid size-10 place-items-center rounded-full bg-surface text-lg disabled:opacity-30" aria-label="Muaji tjetër">›</button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-32">
        {tab === 'home' && (
          <div className="space-y-4">
            {budgets.map((b) => {
              const s = summaries.find((x) => x.budgetId === b.id)
              return s && <BudgetCard key={b.id} budget={b} s={s} />
            })}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSheet('income')} className="h-12 rounded-2xl border border-dashed border-line text-muted active:bg-surface">+ Të hyra</button>
              <button onClick={() => setSheet('transfer')} className="h-12 rounded-2xl border border-dashed border-line text-muted active:bg-surface">⇄ Transferim</button>
            </div>
            <h2 className="pt-2 text-lg font-semibold">Të fundit</h2>
            <ExpenseList expenses={data.expenses.slice(-30)} budgets={budgets} categories={categories} onSelect={setSelected} filters={false} />
          </div>
        )}
        {tab === 'expenses' && <ExpenseList expenses={data.expenses} budgets={budgets} categories={categories} onSelect={setSelected} />}
        {tab === 'moves' && (
          <MovesPage budgets={budgets} incomes={incomes} splits={data.incomeSplits} transfers={data.transfers} onAddIncome={() => setSheet('income')} onAddTransfer={() => setSheet('transfer')} />
        )}
        {tab === 'recurring' && <RecurringPage budgets={budgets} categories={categories} items={recurring} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-md grid-cols-5 items-center border-t border-line bg-bg/95 px-2 pt-2 backdrop-blur" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {([['home', '🏠', 'Ballina'], ['expenses', '🧾', 'Shpenzime']] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${tab === t ? 'text-white' : 'text-muted'}`}>
            <span className="text-xl">{icon}</span>{label}
          </button>
        ))}
        <button onClick={() => setSheet('expense')} aria-label="Shto shpenzim" className="-mt-7 mx-auto grid size-16 place-items-center rounded-full bg-sky-400 text-4xl font-light text-slate-900 shadow-lg shadow-sky-400/30 active:scale-95">
          +
        </button>
        {([['moves', '💶', 'Lëvizje'], ['recurring', '🔁', 'Përsëritura']] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${tab === t ? 'text-white' : 'text-muted'}`}>
            <span className="text-xl">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {sheet === 'expense' && <AddExpenseSheet budgets={budgets} categories={categories} onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet === 'income' && <AddIncomeSheet budgets={budgets} onClose={() => setSheet(null)} />}
      {sheet === 'transfer' && <TransferSheet budgets={budgets} summaries={summaries} onClose={() => setSheet(null)} />}
      {selected && <ExpenseDetailSheet expense={selected} budgets={budgets} categories={categories} onClose={() => setSelected(null)} />}
      {toast && <UndoToast key={toast.n} message={toast.message} onUndo={onUndo} onExpire={expireToast} />}
    </div>
  )
}
