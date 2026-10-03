import { db } from './db'
import type { MonthData } from '../lib/calc'

/** Ngarkon gjithçka që duhet për llogaritjen e një muaji. */
export async function loadMonthData(monthKey: string): Promise<MonthData> {
  const [budgets, incomeSplits, expenses, transfers, adjustments, month] = await Promise.all([
    db.budgets.orderBy('order').toArray(),
    db.incomeSplits.where('monthKey').equals(monthKey).toArray(),
    db.expenses.where('monthKey').equals(monthKey).toArray(),
    db.transfers.where('monthKey').equals(monthKey).toArray(),
    db.adjustments.where('monthKey').equals(monthKey).toArray(),
    db.months.get(monthKey),
  ])
  return { monthKey, budgets, incomeSplits, expenses, transfers, adjustments, carryIn: month?.carryIn ?? {} }
}

/** Të hyrat (ndarjet) dhe shpenzimet e një viti, për tendencën vjetore. */
export async function loadYear(year: number) {
  const range = [`${year}-01`, `${year}-12`] as const
  const [splits, expenses] = await Promise.all([
    db.incomeSplits.where('monthKey').between(range[0], range[1], true, true).toArray(),
    db.expenses.where('monthKey').between(range[0], range[1], true, true).toArray(),
  ])
  return { splits, expenses }
}

/** Muajt që kanë të paktën një të hyrë ose shpenzim, nga më i riu. */
export async function monthsWithData(): Promise<string[]> {
  const [a, b] = await Promise.all([db.expenses.orderBy('monthKey').uniqueKeys(), db.incomeSplits.orderBy('monthKey').uniqueKeys()])
  return [...new Set([...a, ...b].map(String))].sort().reverse()
}
