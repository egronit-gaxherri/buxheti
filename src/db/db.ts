import Dexie, { type EntityTable } from 'dexie'
import type {
  Adjustment, Budget, Category, DescriptionStat, Debt, Expense, Income,
  IncomeSplit, Limit, MonthRecord, Person, Recurring, Setting, Transfer,
} from './schema'
import { normalize } from '../lib/categorize'

export const PERSON_COLORS = ['#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#818cf8', '#f87171', '#a3e635']
/** Burime që nuk janë persona (rroga e vetë përdoruesit etj.). */
const GENERIC_SOURCES = new Set(['rroge', 'rroga', 'tjeter', 'te hyra', ''])

export class BudgetDB extends Dexie {
  budgets!: EntityTable<Budget, 'id'>
  categories!: EntityTable<Category, 'id'>
  incomes!: EntityTable<Income, 'id'>
  incomeSplits!: EntityTable<IncomeSplit, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  transfers!: EntityTable<Transfer, 'id'>
  adjustments!: EntityTable<Adjustment, 'id'>
  debts!: EntityTable<Debt, 'id'>
  recurring!: EntityTable<Recurring, 'id'>
  limits!: EntityTable<Limit, 'id'>
  months!: EntityTable<MonthRecord, 'monthKey'>
  descriptions!: EntityTable<DescriptionStat, 'text'>
  settings!: EntityTable<Setting, 'key'>
  people!: EntityTable<Person, 'id'>

  constructor(name = 'budgeti') {
    super(name)
    this.version(1).stores({
      budgets: 'id, order',
      categories: 'id, *keywords',
      incomes: 'id, monthKey, date',
      incomeSplits: 'id, incomeId, budgetId, monthKey',
      expenses: 'id, monthKey, budgetId, categoryId, date, recurringId',
      transfers: 'id, monthKey',
      adjustments: 'id, monthKey, budgetId',
      debts: 'id, direction, dueDate',
      recurring: 'id, active',
      limits: 'id, categoryId',
      months: 'monthKey',
      descriptions: 'text, count',
      settings: 'key',
    })
    // v2: personat që japin para; të hyrat lidhen me personin
    this.version(2)
      .stores({ people: 'id, name', incomes: 'id, monthKey, date, personId' })
      .upgrade(async (tx) => {
        // Burimet ekzistuese me emër (p.sh. "Edi") bëhen persona
        const ids = new Map<string, string>()
        for (const inc of (await tx.table('incomes').toArray()) as Income[]) {
          const key = normalize(inc.source)
          if (GENERIC_SOURCES.has(key)) continue
          let id = ids.get(key)
          if (!id) {
            id = crypto.randomUUID()
            ids.set(key, id)
            await tx.table('people').add({ id, name: inc.source.trim(), color: PERSON_COLORS[(ids.size - 1) % PERSON_COLORS.length], archived: false, createdAt: Date.now() })
          }
          await tx.table('incomes').update(inc.id, { personId: id })
        }
      })
  }
}

export const db = new BudgetDB()
export const newId = () => crypto.randomUUID()
