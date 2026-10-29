import { db as defaultDb, newId, type BudgetDB } from './db'
import { DEFAULT_CATEGORIES } from '../lib/categorize'

export const DEFAULT_BUDGETS = [
  { name: 'Shtëpi', color: '#38bdf8' },
  { name: 'Personal', color: '#a78bfa' },
]

/** Ekzekutohet një herë: krijon buxhetet dhe kategoritë fillestare dhe korrigjon borxhet 'i_owe' ekzistuese. */
export async function seedIfEmpty(db: BudgetDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.budgets, db.categories, db.debts, db.adjustments, db.settings], async () => {
    if ((await db.budgets.count()) === 0) {
      await db.budgets.bulkAdd(DEFAULT_BUDGETS.map((b, i) => ({ id: newId(), order: i, ...b })))
    }
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ id: newId(), ...c })))
    }
    // Rregullim automatik njëherësh: heq lëvizjen fillestare (+X €) nga buxheti për borxhet "I kam borxh" (i_owe)
    // që ishin regjistruar gabimisht me buxhetin Personal të parazgjedhur.
    const fixKey = 'fix_i_owe_budget_v1'
    if (!(await db.settings.get(fixKey))) {
      const allDebts = await db.debts.toArray()
      for (const d of allDebts) {
        if (d.direction === 'i_owe' && (d.budgetId || d.adjustmentId)) {
          if (d.adjustmentId) await db.adjustments.delete(d.adjustmentId)
          await db.debts.put({ ...d, budgetId: undefined, adjustmentId: undefined })
        }
      }
      await db.settings.put({ key: fixKey, value: '1' })
    }
  })
}
