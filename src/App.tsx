import { useCallback, useEffect, useState } from 'react'
import { useBudgets, useCategories, useIncomes, useLimits, useMonth, useRecurring } from './db/hooks'
import { deleteTransfer, remainingFor, runRecurring, undoExpenses } from './db/actions'
import { loadMonthData } from './db/queries'
import type { Expense, Transfer } from './db/schema'
import { BudgetCard } from './components/BudgetCard'
import { ExpenseList } from './components/ExpenseList'
import { AddExpenseSheet } from './components/AddExpenseSheet'
import { AddIncomeSheet } from './components/AddIncomeSheet'
import { ExpenseDetailSheet } from './components/ExpenseDetailSheet'
import { UndoToast } from './components/UndoToast'
import { MovesPage } from './components/MovesPage'
import { RecurringPage } from './components/RecurringPage'
import { TransferSheet } from './components/TransferSheet'
import { AnalyticsPage } from './components/AnalyticsPage'
import { ImportSheet } from './components/ImportSheet'
import { ReconcileSheet } from './components/ReconcileSheet'
import { LimitsPage } from './components/LimitsPage'
import { MORE_TITLES, MorePage, type MoreView } from './components/MorePage'
import { currentMonthKey, formatMonthSQ, shiftMonth, todayStr } from './lib/dates'
import { formatEUR } from './lib/money'
import { forecastBudget, limitCrossing, limitLevel, upcomingRecurring } from './lib/stats'

type Tab = 'home' | 'expenses' | 'stats' | 'more'
interface ToastState {
  expenses: Expense[]
  cover?: Transfer
  message: string
  detail?: { text: string; level: 'warn' | 'over' }
  n: number
}

export default function App() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [tab, setTab] = useState<Tab>('home')
  const [moreView, setMoreView] = useState<MoreView | null>(null)
  const [sheet, setSheet] = useState<'expense' | 'income' | 'transfer' | 'import' | 'reconcile' | null>(null)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const budgets = useBudgets()
  const categories = useCategories()
  const { data, summaries } = useMonth(monthKey)
  const { data: prev } = useMonth(shiftMonth(monthKey, -1))
  const incomes = useIncomes(monthKey)
  const recurring = useRecurring()
  const limits = useLimits()

  // Shto shpenzimet e përsëritura kur hapet aplikacioni dhe kur kthehet në plan të parë
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && runRecurring()
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [])

  const expireToast = useCallback(() => setToast(null), [])

  // Njoftimi i vjetër s'duhet të mbulojë një fletë të re (p.sh. paralajmërimin e tejkalimit)
  useEffect(() => {
    if (sheet) setToast(null)
  }, [sheet])

  if (!budgets || !categories || !data || !prev || !summaries || !incomes || !recurring || !limits) return null

  async function onSaved(e: Expense, cover?: Transfer) {
    setSheet(null)
    const left = await remainingFor(e.budgetId, e.monthKey)
    const name = budgets!.find((b) => b.id === e.budgetId)?.name
    const message = left >= 0 ? `Në ${name} kanë mbetur ${formatEUR(left)}` : `${name} ka kaluar buxhetin me ${formatEUR(-left)}`

    // Alarmi i limitit të kategorisë (80% / 100%)
    let detail: ToastState['detail']
    const limit = limits!.find((l) => l.categoryId === e.categoryId)
    if (limit) {
      const spent = (await loadMonthData(e.monthKey)).expenses.filter((x) => x.categoryId === e.categoryId).reduce((a, x) => a + x.amount, 0)
      const crossing = limitCrossing(spent - e.amount, spent, limit.amount)
      const cat = categories!.find((c) => c.id === e.categoryId)?.name
      if (crossing)
        detail = {
          level: crossing,
          text: `${cat}: ${crossing === 'over' ? 'ke kaluar limitin' : 'ke arritur 80% të limitit'} (${formatEUR(spent)} / ${formatEUR(limit.amount)})`,
        }
    }
    setToast({ expenses: [e], cover, message, detail, n: Date.now() })
  }

  function onImported(made: Expense[]) {
    setSheet(null)
    const total = made.reduce((a, e) => a + e.amount, 0)
    setToast({ expenses: made, message: `U importuan ${made.length} shpenzime (${formatEUR(total)})`, n: Date.now() })
  }

  async function onUndo() {
    if (!toast) return
    await undoExpenses(toast.expenses)
    if (toast.cover) await deleteTransfer(toast.cover.id)
    setToast(null)
  }

  const isCurrent = monthKey === currentMonthKey()
  const today = todayStr()
  const overLimits = limits
    .map((l) => ({ l, spent: data.expenses.filter((e) => e.categoryId === l.categoryId).reduce((a, e) => a + e.amount, 0) }))
    .filter((x) => limitLevel(x.spent, x.l.amount) !== 'ok')

  const goTab = (t: Tab) => {
    setTab(t)
    setMoreView(null)
  }
  const title = tab === 'more' && moreView ? MORE_TITLES[moreView] : null

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
        {title && (
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => setMoreView(null)} className="grid size-9 place-items-center rounded-full bg-surface" aria-label="Kthehu">‹</button>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
        )}

        {tab === 'home' && (
          <div className="space-y-4">
            {overLimits.length > 0 && (
              <div className="space-y-1.5 rounded-2xl bg-amber-500/10 p-4 text-sm" role="alert">
                {overLimits.map(({ l, spent }) => {
                  const over = limitLevel(spent, l.amount) === 'over'
                  const c = categories.find((x) => x.id === l.categoryId)
                  return (
                    <p key={l.id} className={over ? 'text-red-300' : 'text-amber-300'}>
                      {over ? '🚨' : '⚠'} {c?.icon} {c?.name}: {formatEUR(spent)} / {formatEUR(l.amount)} {over ? '(limiti u kalua)' : `(${Math.round((spent / l.amount) * 100)}%)`}
                    </p>
                  )
                })}
              </div>
            )}
            {budgets.map((b) => {
              const s = summaries.find((x) => x.budgetId === b.id)
              const forecast = s && forecastBudget({
                monthKey,
                today,
                remaining: s.remaining,
                expenses: data.expenses.filter((e) => e.budgetId === b.id),
                upcomingFixed: upcomingRecurring(recurring, b.id, today),
              })
              return s && <BudgetCard key={b.id} budget={b} s={s} forecast={forecast} />
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
        {tab === 'stats' && <AnalyticsPage monthKey={monthKey} data={data} prev={prev} budgets={budgets} categories={categories} />}
        {tab === 'more' && !moreView && <MorePage onOpen={setMoreView} onImport={() => setSheet('import')} onReconcile={() => setSheet('reconcile')} />}
        {tab === 'more' && moreView === 'moves' && (
          <MovesPage budgets={budgets} incomes={incomes} splits={data.incomeSplits} transfers={data.transfers} adjustments={data.adjustments} onAddIncome={() => setSheet('income')} onAddTransfer={() => setSheet('transfer')} />
        )}
        {tab === 'more' && moreView === 'recurring' && <RecurringPage budgets={budgets} categories={categories} items={recurring} />}
        {tab === 'more' && moreView === 'limits' && <LimitsPage categories={categories} limits={limits} expenses={data.expenses} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-md grid-cols-5 items-center border-t border-line bg-bg/95 px-2 pt-2 backdrop-blur" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {([['home', '🏠', 'Ballina'], ['expenses', '🧾', 'Shpenzime']] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => goTab(t)} className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${tab === t ? 'text-white' : 'text-muted'}`}>
            <span className="text-xl">{icon}</span>{label}
          </button>
        ))}
        <button onClick={() => setSheet('expense')} aria-label="Shto shpenzim" className="-mt-7 mx-auto grid size-16 place-items-center rounded-full bg-sky-400 text-4xl font-light text-slate-900 shadow-lg shadow-sky-400/30 active:scale-95">
          +
        </button>
        {([['stats', '📊', 'Analiza'], ['more', '⋯', 'Më shumë']] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => goTab(t)} className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${tab === t ? 'text-white' : 'text-muted'}`}>
            <span className="text-xl">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {sheet === 'expense' && <AddExpenseSheet budgets={budgets} categories={categories} onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet === 'income' && <AddIncomeSheet budgets={budgets} onClose={() => setSheet(null)} />}
      {sheet === 'transfer' && <TransferSheet budgets={budgets} summaries={summaries} onClose={() => setSheet(null)} />}
      {sheet === 'import' && <ImportSheet budgets={budgets} categories={categories} onClose={() => setSheet(null)} onImported={onImported} />}
      {sheet === 'reconcile' && <ReconcileSheet budgets={budgets} categories={categories} onClose={() => setSheet(null)} />}
      {selected && <ExpenseDetailSheet expense={selected} budgets={budgets} categories={categories} onClose={() => setSelected(null)} />}
      {toast && <UndoToast key={toast.n} message={toast.message} detail={toast.detail} onUndo={onUndo} onExpire={expireToast} />}
    </div>
  )
}
