import { useMemo, useState } from 'react'
import type { Budget, Category } from '../db/schema'
import type { MonthData } from '../lib/calc'
import { DailyBars, DonutChart } from './Charts'
import { categoryColor, compareMonths, dailySpending, spendingByCategory } from '../lib/stats'
import { currentMonthKey, formatMonthSQ, shiftMonth, todayStr } from '../lib/dates'
import { formatEUR } from '../lib/money'
import { InsightsSection } from './InsightsSection'

interface Props {
  monthKey: string
  data: MonthData
  prev: MonthData
  budgets: Budget[]
  categories: Category[]
}

export function AnalyticsPage({ monthKey, data, prev, budgets, categories }: Props) {
  const [budgetId, setBudgetId] = useState<string | null>(null)
  const pick = <T extends { budgetId: string }>(xs: T[]) => (budgetId ? xs.filter((x) => x.budgetId === budgetId) : xs)
  const cur = useMemo(() => pick(data.expenses), [data, budgetId]) // eslint-disable-line react-hooks/exhaustive-deps
  const prv = useMemo(() => pick(prev.expenses), [prev, budgetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrent = monthKey === currentMonthKey()
  const todayDay = isCurrent ? Number(todayStr().slice(8, 10)) : null
  const cmp = compareMonths(cur, prv, todayDay)

  const slices = spendingByCategory(cur).map((c) => ({
    id: c.categoryId,
    label: categories.find((x) => x.id === c.categoryId)?.name ?? 'Tjetër',
    color: categoryColor(categories, c.categoryId),
    value: c.amount,
  }))

  const chip = (a: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm ${a ? 'bg-sky-400 text-slate-900' : 'bg-surface-2'}`
  const base = cmp.previousSameDay ?? cmp.previous
  const maxBar = Math.max(cmp.current, base, 1)
  const prevName = formatMonthSQ(shiftMonth(monthKey, -1))

  return (
    <div className="space-y-4">
      {isCurrent && <InsightsSection categories={categories} />}
      <div className="flex gap-2 overflow-x-auto">
        <button className={chip(!budgetId)} onClick={() => setBudgetId(null)}>Të gjitha</button>
        {budgets.map((b) => (
          <button key={b.id} className={chip(budgetId === b.id)} onClick={() => setBudgetId(b.id)}>{b.name}</button>
        ))}
      </div>

      {cur.length === 0 ? (
        <p className="py-12 text-center text-muted">S’ka shpenzime për {formatMonthSQ(monthKey)}.</p>
      ) : (
        <>
          <section className="rounded-3xl bg-surface p-5">
            <h2 className="mb-4 font-semibold">Sipas kategorisë</h2>
            <DonutChart slices={slices} />
          </section>
          <section className="rounded-3xl bg-surface p-5">
            <h2 className="mb-2 font-semibold">Shpenzimet ditore</h2>
            <DailyBars days={dailySpending(cur, monthKey)} todayDay={todayDay} />
          </section>
        </>
      )}

      <section className="rounded-3xl bg-surface p-5">
        <h2 className="mb-3 font-semibold">Krahasim me muajin e kaluar</h2>
        {[
          [formatMonthSQ(monthKey), cmp.current, '#38bdf8'],
          [cmp.previousSameDay != null ? `${prevName} (deri më ${todayDay})` : prevName, base, '#64748b'],
        ].map(([label, v, color]) => (
          <div key={label as string} className="mb-3">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">{label}</span>
              <span className="tabnum font-semibold">{formatEUR(v as number)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${((v as number) / maxBar) * 100}%`, background: color as string }} />
            </div>
          </div>
        ))}
        <p className="text-sm">
          {cmp.deltaPct == null
            ? <span className="text-muted">S’ka të dhëna nga muaji i kaluar për krahasim.</span>
            : cmp.deltaPct === 0
              ? 'Njësoj si muaji i kaluar.'
              : <span className={cmp.deltaPct > 0 ? 'text-amber-400' : 'text-ok'}>{Math.abs(cmp.deltaPct)}% {cmp.deltaPct > 0 ? 'më shumë' : 'më pak'} se muaji i kaluar{cmp.previousSameDay != null ? ' (në të njëjtën ditë)' : ''}</span>}
        </p>
      </section>
    </div>
  )
}
