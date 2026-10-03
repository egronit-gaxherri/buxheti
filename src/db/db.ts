import Dexie, { type EntityTable } from 'dexie'
import type {
  Adjustment, Budget, Category, DescriptionStat, Debt, Expense, Income,
  IncomeSplit, Limit, MonthRecord, Recurring, Setting, Transfer,
} from './schema'

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
  }
}

export const db = new BudgetDB()
export const newId = () => crypto.randomUUID()
