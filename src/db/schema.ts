// Të gjitha shumat janë në CENT (integer). monthKey = 'YYYY-MM', date = 'YYYY-MM-DD'.

export interface Budget {
  id: string
  name: string
  color: string
  order: number
}

export interface Category {
  id: string
  name: string
  icon: string
  keywords: string[] // fjalë kyçe të vogla, pa theks, për auto-kategorizim
}

export interface Income {
  id: string
  monthKey: string
  source: string // "Rrogë", "Edi", ...
  amount: number
  date: string
  createdAt: number
}

/** Ndarja e një të hyre mes buxheteve. Shuma e ndarjeve = shuma e të hyrës. */
export interface IncomeSplit {
  id: string
  incomeId: string
  budgetId: string
  monthKey: string
  amount: number
}

export interface Expense {
  id: string
  monthKey: string
  budgetId: string
  categoryId: string
  amount: number
  description: string
  note?: string
  receipt?: Blob
  date: string
  createdAt: number
  recurringId?: string
}

export interface Transfer {
  id: string
  monthKey: string
  fromBudgetId: string
  toBudgetId: string
  amount: number
  date: string
  createdAt: number
  note?: string
}

/** Korrigjim i bilancit (përshtatje me realitetin). amount mund të jetë negativ. */
export interface Adjustment {
  id: string
  monthKey: string
  budgetId: string
  amount: number
  date: string
  createdAt: number
  note?: string
}

export interface Debt {
  id: string
  direction: 'owed_to_me' | 'i_owe'
  counterparty: string
  amount: number
  dueDate?: string
  settled: boolean
  createdAt: number
}

export interface Recurring {
  id: string
  budgetId: string
  categoryId: string
  amount: number
  description: string
  dayOfMonth: number
  active: boolean
  lastRunMonth?: string
}

export interface Limit {
  id: string
  categoryId: string
  amount: number // limit mujor
}

export interface MonthRecord {
  monthKey: string
  closed: boolean
  /** Bartja në këtë muaj, për çdo buxhet (budgetId → cent). */
  carryIn: Record<string, number>
}

export interface DescriptionStat {
  text: string // i normalizuar (lowercase)
  display: string
  count: number
  lastCategoryId: string
  lastBudgetId: string
  lastUsed: number
}

export interface Setting {
  key: string
  value: unknown
}
