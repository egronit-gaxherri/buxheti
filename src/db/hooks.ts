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
