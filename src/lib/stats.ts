import type { Category, Expense, Recurring } from '../db/schema'
import { daysInMonth, monthKeyOf } from './dates'

/* ───────── Grafikët ───────── */

export function spendingByCategory(expenses: Expense[]): { categoryId: string; amount: number }[] {
  const m = new Map<string, number>()
  for (const e of expenses) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amount)
  return [...m.entries()].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount)
}

/** Shpenzimi për çdo ditë të muajit (indeksi 0 = dita 1). */
export function dailySpending(expenses: Expense[], monthKey: string): number[] {
  const days = new Array<number>(daysInMonth(monthKey)).fill(0)
  for (const e of expenses) if (e.monthKey === monthKey) days[Number(e.date.slice(8, 10)) - 1] += e.amount
  return days
}

const PALETTE = ['#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#818cf8', '#f87171', '#a3e635', '#94a3b8']
export function categoryColor(categories: Category[], id: string): string {
  const i = categories.findIndex((c) => c.id === id)
  return PALETTE[(i < 0 ? PALETTE.length - 1 : i) % PALETTE.length]
}

export interface MonthComparison {
  current: number
  previous: number
  /** Muaji i kaluar deri në të njëjtën ditë (vetëm kur krahasohet muaji aktual). */
  previousSameDay: number | null
  /** Ndryshimi në % kundrejt bazës së krahasimit; null nëse baza është 0. */
  deltaPct: number | null
}

export function compareMonths(cur: Expense[], prev: Expense[], upToDay: number | null): MonthComparison {
  const sum = (xs: Expense[]) => xs.reduce((a, e) => a + e.amount, 0)
  const current = sum(cur)
  const previous = sum(prev)
  const previousSameDay = upToDay == null ? null : sum(prev.filter((e) => Number(e.date.slice(8, 10)) <= upToDay))
  const base = previousSameDay ?? previous
  return { current, previous, previousSameDay, deltaPct: base > 0 ? Math.round(((current - base) / base) * 100) : null }
}

/* ───────── Parashikimi ───────── */

export type Forecast =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'runout'; date: string; reason: 'rate' | 'fixed' }
  | { kind: 'ok'; projectedLeft: number }

/** Shpenzime të përsëritura që s'janë shtuar ende këtë muaj (do të vijnë pas sotit). */
export function upcomingRecurring(items: Recurring[], budgetId: string, today: string): number {
  const cur = monthKeyOf(today)
  const todayDay = Number(today.slice(8, 10))
  return items
    .filter((r) => r.active && r.budgetId === budgetId && r.lastRunMonth !== cur)
    .filter((r) => Math.min(r.dayOfMonth, daysInMonth(cur)) > todayDay)
    .reduce((a, r) => a + r.amount, 0)
}

/**
 * Me ritmin aktual të shpenzimit (pa ato të përsëritura, që nuk shtrihen),
 * a mbarohen paratë para fundit të muajit? Kërkon të paktën 3 ditë të dhëna.
 */
export function forecastBudget(p: {
  monthKey: string
  today: string
  remaining: number
  expenses: Expense[] // vetëm të këtij buxheti, këtij muaji
  upcomingFixed: number
}): Forecast {
  if (p.monthKey !== monthKeyOf(p.today)) return { kind: 'none' }
  // Buxhet i ri pa asnjë lëvizje: s'ka asgjë për të paralajmëruar
  if (p.remaining === 0 && p.expenses.length === 0) return { kind: 'none' }
  if (p.remaining <= 0) return { kind: 'empty' }
  const day = Number(p.today.slice(8, 10))
  const dim = daysInMonth(p.monthKey)
  const variable = p.expenses.filter((e) => !e.recurringId).reduce((a, e) => a + e.amount, 0)
  const afterFixed = p.remaining - p.upcomingFixed
  if (afterFixed <= 0) return { kind: 'runout', date: p.today, reason: 'fixed' }
  if (day < 3 || variable === 0) return { kind: 'none' }
  const rate = variable / day
  const runOutDay = day + Math.floor(afterFixed / rate)
  if (runOutDay < dim) return { kind: 'runout', date: `${p.monthKey}-${String(runOutDay).padStart(2, '0')}`, reason: 'rate' }
  return { kind: 'ok', projectedLeft: Math.round(afterFixed - rate * (dim - day)) }
}

/* ───────── Limitet ───────── */

export const LIMIT_WARN = 0.8
export type LimitLevel = 'ok' | 'warn' | 'over'

export function limitLevel(spent: number, limit: number): LimitLevel {
  if (limit <= 0) return 'ok'
  if (spent >= limit) return 'over'
  if (spent >= limit * LIMIT_WARN) return 'warn'
  return 'ok'
}

/** Alarmi që duhet shfaqur kur një shpenzim e çon kategorinë nga `before` në `after`. */
export function limitCrossing(before: number, after: number, limit: number): 'warn' | 'over' | null {
  const rank = { ok: 0, warn: 1, over: 2 }
  const a = limitLevel(after, limit)
  return rank[a] > rank[limitLevel(before, limit)] ? (a as 'warn' | 'over') : null
}
