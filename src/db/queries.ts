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
