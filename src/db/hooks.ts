import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { loadMonthData } from './queries'
import { summarizeMonth } from '../lib/calc'

export const useBudgets = () => useLiveQuery(() => db.budgets.orderBy('order').toArray(), [])
export const useCategories = () => useLiveQuery(() => db.categories.toArray(), [])

export function useMonth(monthKey: string) {
  const data = useLiveQuery(() => loadMonthData(monthKey), [monthKey])
  const summaries = data ? summarizeMonth(data) : undefined
  return { data, summaries }
}

export const useIncomes = (monthKey: string) =>
  useLiveQuery(() => db.incomes.where('monthKey').equals(monthKey).reverse().sortBy('date'), [monthKey])
export const useRecurring = () => useLiveQuery(() => db.recurring.toArray(), [])
export const useLimits = () => useLiveQuery(() => db.limits.toArray(), [])
export const usePeople = () => useLiveQuery(() => db.people.orderBy('name').toArray(), [])
/** Të gjitha të hyrat dhe ndarjet (për totalet e personave: vit / gjithsej). */
export const useAllIncomes = () =>
  useLiveQuery(async () => ({ incomes: await db.incomes.toArray(), splits: await db.incomeSplits.toArray() }), [])
export const useDebts = () => useLiveQuery(() => db.debts.toArray(), [])
