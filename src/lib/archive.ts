import type { Expense, IncomeSplit } from '../db/schema'
import type { MonthData } from './calc'
import { summarizeMonth } from './calc'

export interface MonthTotals {
  monthKey: string
  income: number
  spent: number
  /** Kursimi = të hyrat − shpenzimet (korrigjimet dhe transferimet nuk hyjnë). */
  saved: number
}

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0)

export function monthTotals(d: MonthData): MonthTotals {
  const income = sum(d.incomeSplits)
  const spent = sum(d.expenses)
  return { monthKey: d.monthKey, income, spent, saved: income - spent }
}

/** Përmbledhja për mbylljen e muajit: totalet + mbetja e çdo buxheti. */
export function closingSummary(d: MonthData, today?: string) {
  return { totals: monthTotals(d), budgets: summarizeMonth(d, today) }
}

/** 12 muajt e vitit (edhe ata pa të dhëna, me 0). */
export function yearTrend(year: number, splits: IncomeSplit[], expenses: Expense[]): MonthTotals[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`
    const income = sum(splits.filter((s) => s.monthKey === mk))
    const spent = sum(expenses.filter((e) => e.monthKey === mk))
    return { monthKey: mk, income, spent, saved: income - spent }
  })
}
