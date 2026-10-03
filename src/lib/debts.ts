import type { Debt } from '../db/schema'
import { parseDate } from './dates'

export const paidOf = (d: Debt) => d.payments.reduce((a, p) => a + p.amount, 0)
export const remainingOf = (d: Debt) => Math.max(0, d.amount - paidOf(d))

export type DebtStatus = 'settled' | 'overdue' | 'due-soon' | 'open'
export const DUE_SOON_DAYS = 3

/** Ditët deri në afat (negative = ka kaluar). null kur s’ka afat. */
export function daysUntilDue(d: Debt, today: string): number | null {
  if (!d.dueDate) return null
  return Math.round((parseDate(d.dueDate).getTime() - parseDate(today).getTime()) / 86_400_000)
}

export function debtStatus(d: Debt, today: string): DebtStatus {
  if (d.settled || remainingOf(d) === 0) return 'settled'
  const days = daysUntilDue(d, today)
  if (days == null) return 'open'
  if (days < 0) return 'overdue'
  if (days <= DUE_SOON_DAYS) return 'due-soon'
  return 'open'
}

export interface DebtTotals {
  owedToMe: number
  iOwe: number
  /** pozitiv = të tjerët të kanë më shumë borxh se ti atyre */
  net: number
}

export function debtTotals(debts: Debt[]): DebtTotals {
  let owedToMe = 0
  let iOwe = 0
  for (const d of debts) {
    if (d.settled) continue
    if (d.direction === 'owed_to_me') owedToMe += remainingOf(d)
    else iOwe += remainingOf(d)
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe }
}

/**
 * Shenja e lëvizjes në buxhet:
 * - krijimi: i dhashë hua → paratë dalin (−); mora hua → hyjnë (+)
 * - pagesa:  më kthyen → hyjnë (+); i ktheva → dalin (−)
 */
export function budgetEffect(direction: Debt['direction'], kind: 'create' | 'payment', amount: number): number {
  const out = (direction === 'owed_to_me') === (kind === 'create')
  return out ? -amount : amount
}

/** "Edi të ka borxh" / "I ke borxh Edit" — teksti i drejtimit për UI. */
export const directionLabel = (d: Pick<Debt, 'direction'>) => (d.direction === 'owed_to_me' ? 'Më ka borxh' : 'I kam borxh')

/** Renditja: me afat të kaluar, pastaj afati më i afërt, pastaj pa afat; të shlyerat në fund. */
export function sortDebts(debts: Debt[], today: string): Debt[] {
  const rank = { overdue: 0, 'due-soon': 1, open: 2, settled: 3 }
  return [...debts].sort(
    (a, b) =>
      rank[debtStatus(a, today)] - rank[debtStatus(b, today)] ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      b.createdAt - a.createdAt,
  )
}
