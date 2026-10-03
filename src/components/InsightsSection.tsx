import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addRecurring } from '../db/actions'
import { setSetting, useSetting } from '../db/settings'
import type { Category } from '../db/schema'
import { computeInsights, weekSummary, type Insight } from '../lib/insights'
import { currentMonthKey, formatDateSQ, shiftMonth, todayStr } from '../lib/dates'
import { formatEUR } from '../lib/money'

const DISMISSED = 'dismissedInsights'
const TONE = { warn: 'bg-amber-500/10 text-amber-200', good: 'bg-emerald-500/10 text-emerald-200', info: 'bg-surface text-white/90' } as const

/** Vëzhgimet automatike + përmbledhja e javës (vetëm për muajin aktual). */
export function InsightsSection({ categories, limit, compact }: { categories: Category[]; limit?: number; compact?: boolean }) {
  const today = todayStr()
  const cur = currentMonthKey()
  const dismissed = useSetting<string[]>(DISMISSED)
  const data = useLiveQuery(async () => {
    const from = shiftMonth(cur, -6)
    const [expenses, incomeSplits, recurring] = await Promise.all([
      db.expenses.where('monthKey').between(from, cur, true, true).toArray(),
      db.incomeSplits.where('monthKey').between(shiftMonth(cur, -1), cur, true, true).toArray(),
      db.recurring.toArray(),
    ])
    return { expenses, incomeSplits, recurring }
  }, [cur])
  if (!data || dismissed === undefined) return null

  const insights = computeInsights({ today, categories, ...data }, dismissed ?? [], limit)
  const week = weekSummary(data.expenses, today)
  const cat = (id?: string) => categories.find((c) => c.id === id)

  const dismiss = (i: Insight) => setSetting(DISMISSED, [...(dismissed ?? []), i.id].slice(-200))
  async function act(i: Insight) {
    if (i.action?.kind !== 'make-recurring') return
    const a = i.action
    await addRecurring({ budgetId: a.budgetId, categoryId: a.categoryId, amount: a.amount, description: a.description, dayOfMonth: a.dayOfMonth })
  }

  if (compact && insights.length === 0) return null

  return (
    <section className="space-y-2">
      {!compact && (
        <div className="rounded-3xl bg-surface p-5">
          <div className="text-sm text-muted">7 ditët e fundit · nga {formatDateSQ(week.from)}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="tabnum text-2xl font-bold">{formatEUR(week.total)}</span>
            {week.deltaPct !== null && (
              <span className={`text-sm ${week.deltaPct > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {week.deltaPct > 0 ? '▲' : week.deltaPct < 0 ? '▼' : '='} {Math.abs(week.deltaPct)}% nga java e kaluar
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted">
            {week.count} {week.count === 1 ? 'shpenzim' : 'shpenzime'}
            {week.topCategoryId && ` · më shumë: ${cat(week.topCategoryId)?.icon ?? ''} ${cat(week.topCategoryId)?.name ?? ''} ${formatEUR(week.topAmount)}`}
          </div>
        </div>
      )}
      {!compact && <h2 className="px-1 pt-2 font-semibold">💡 Vëzhgime</h2>}
      {insights.length === 0 && !compact && <p className="px-1 text-sm text-muted">Ende asgjë për të vënë re. Sa më shumë muaj të dhëna, aq më të sakta bëhen vëzhgimet.</p>}
      {insights.map((i) => (
        <div key={i.id} className={`rounded-2xl p-4 ${TONE[i.tone]}`}>
          <div className="flex items-start gap-3">
            <span className="text-xl">{i.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="mt-0.5 text-sm opacity-80">{i.detail}</p>
              {i.action && (
                <button onClick={() => act(i)} className="mt-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900">
                  Shto si të përsëritur (çdo {i.action.dayOfMonth} të muajit)
                </button>
              )}
            </div>
            <button onClick={() => dismiss(i)} aria-label="Mos e shfaq më" className="px-1 text-sm opacity-60">✕</button>
          </div>
        </div>
      ))}
    </section>
  )
}
