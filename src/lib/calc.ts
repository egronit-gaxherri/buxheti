import type { Adjustment, Budget, Expense, IncomeSplit, Transfer } from '../db/schema'
import { daysRemaining } from './dates'

export interface MonthData {
  monthKey: string
  budgets: Budget[]
  incomeSplits: IncomeSplit[]
  expenses: Expense[]
  transfers: Transfer[]
  adjustments: Adjustment[]
  carryIn: Record<string, number>
}

export interface BudgetSummary {
  budgetId: string
  /** Fondet e disponueshme: bartja + të hyrat + transferime brenda − jashtë. */
  total: number
  spent: number
  adjustments: number
  remaining: number
  /** remaining / total (0 nëse total = 0) */
  ratio: number
  low: boolean
  daysLeft: number
  /** Sa mund të shpenzohet sot (cent), 0 nëse s'ka mbetje. */
  perDay: number
}

export const LOW_RATIO = 0.15

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function summarizeBudget(d: MonthData, budgetId: string, today?: string): BudgetSummary {
  const income = sum(d.incomeSplits.filter((s) => s.budgetId === budgetId).map((s) => s.amount))
  const tin = sum(d.transfers.filter((t) => t.toBudgetId === budgetId).map((t) => t.amount))
  const tout = sum(d.transfers.filter((t) => t.fromBudgetId === budgetId).map((t) => t.amount))
  const total = (d.carryIn[budgetId] ?? 0) + income + tin - tout
  const spent = sum(d.expenses.filter((e) => e.budgetId === budgetId).map((e) => e.amount))
  const adjustments = sum(d.adjustments.filter((a) => a.budgetId === budgetId).map((a) => a.amount))
  const remaining = total - spent + adjustments
  const ratio = total > 0 ? remaining / total : 0
  const daysLeft = daysRemaining(d.monthKey, today)
  return {
    budgetId,
    total,
    spent,
    adjustments,
    remaining,
    ratio,
    low: total > 0 ? ratio < LOW_RATIO : remaining < 0,
    daysLeft,
    perDay: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
  }
}

export function summarizeMonth(d: MonthData, today?: string): BudgetSummary[] {
  return d.budgets.map((b) => summarizeBudget(d, b.id, today))
}
