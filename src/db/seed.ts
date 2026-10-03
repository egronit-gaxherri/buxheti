import { db as defaultDb, newId, type BudgetDB } from './db'
import { DEFAULT_CATEGORIES } from '../lib/categorize'

export const DEFAULT_BUDGETS = [
  { name: 'Shtëpi', color: '#38bdf8' },
  { name: 'Personal', color: '#a78bfa' },
]

/** Ekzekutohet një herë: krijon buxhetet dhe kategoritë fillestare. */
export async function seedIfEmpty(db: BudgetDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.budgets, db.categories, async () => {
    if ((await db.budgets.count()) === 0) {
      await db.budgets.bulkAdd(DEFAULT_BUDGETS.map((b, i) => ({ id: newId(), order: i, ...b })))
    }
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ id: newId(), ...c })))
    }
  })
}
