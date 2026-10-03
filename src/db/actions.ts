import { db, newId } from './db'
import type { Expense, Income, IncomeSplit, Recurring, Transfer } from './schema'
import { monthKeyOf, todayStr } from '../lib/dates'
import { normalize } from '../lib/categorize'
import { pendingDates } from '../lib/recurring'
import { summarizeBudget } from '../lib/calc'
import { loadMonthData } from './queries'

export interface NewExpense {
  amount: number
  description: string
  budgetId: string
  categoryId: string
  date?: string
  note?: string
  receipt?: Blob
}

export async function addExpense(input: NewExpense): Promise<Expense> {
  if (!(input.amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
  const date = input.date ?? todayStr()
  const expense: Expense = {
    id: newId(),
    monthKey: monthKeyOf(date),
    budgetId: input.budgetId,
    categoryId: input.categoryId,
    amount: Math.round(input.amount),
    description: input.description.trim(),
    note: input.note?.trim() || undefined,
    receipt: input.receipt,
    date,
    createdAt: Date.now(),
  }
  await db.transaction('rw', db.expenses, db.descriptions, async () => {
    await db.expenses.add(expense)
    const text = normalize(expense.description)
    if (text) {
      const prev = await db.descriptions.get(text)
      await db.descriptions.put({
        text,
        display: expense.description,
        count: (prev?.count ?? 0) + 1,
        lastCategoryId: expense.categoryId,
        lastBudgetId: expense.budgetId,
        lastUsed: Date.now(),
      })
    }
  })
  return expense
}

/** Zhbën një shpenzim të sapo shtuar (heq edhe numërimin në historik). */
export async function undoExpense(expense: Expense): Promise<void> {
  await db.transaction('rw', db.expenses, db.descriptions, async () => {
    await db.expenses.delete(expense.id)
    const text = normalize(expense.description)
    const prev = text ? await db.descriptions.get(text) : undefined
    if (prev) {
      if (prev.count <= 1) await db.descriptions.delete(text)
      else await db.descriptions.update(text, { count: prev.count - 1 })
    }
  })
}

export async function updateExpense(id: string, patch: Partial<Pick<Expense, 'categoryId' | 'note' | 'receipt' | 'description'>>) {
  await db.expenses.update(id, patch)
}

export async function deleteExpense(id: string) {
  await db.expenses.delete(id)
}

/** Sa ka mbetur në një buxhet për muajin e dhënë (cent). */
export async function remainingFor(budgetId: string, monthKey: string): Promise<number> {
  return summarizeBudget(await loadMonthData(monthKey), budgetId).remaining
}

export interface NewIncome {
  source: string
  amount: number
  date?: string
  splits: { budgetId: string; amount: number }[]
}

/** Shton një të hyrë me ndarjet e saj. Shuma e ndarjeve duhet të jetë e barabartë me shumën. */
export async function addIncome(input: NewIncome): Promise<Income> {
  const total = input.splits.reduce((a, s) => a + s.amount, 0)
  if (!(input.amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
  if (total !== input.amount) throw new Error('Ndarjet duhet të mbledhin saktësisht shumën e të hyrës')
  const date = input.date ?? todayStr()
  const monthKey = monthKeyOf(date)
  const income: Income = { id: newId(), monthKey, source: input.source.trim() || 'Të hyra', amount: input.amount, date, createdAt: Date.now() }
  const splits: IncomeSplit[] = input.splits
    .filter((s) => s.amount > 0)
    .map((s) => ({ id: newId(), incomeId: income.id, budgetId: s.budgetId, monthKey, amount: s.amount }))
  await db.transaction('rw', db.incomes, db.incomeSplits, async () => {
    await db.incomes.add(income)
    await db.incomeSplits.bulkAdd(splits)
  })
  return income
}

export async function deleteIncome(id: string) {
  await db.transaction('rw', db.incomes, db.incomeSplits, async () => {
    await db.incomeSplits.where('incomeId').equals(id).delete()
    await db.incomes.delete(id)
  })
}

/** Sugjerime përshkrimi nga historiku: sipas prefiksit, më të përdorurat së pari. */
export async function suggestDescriptions(query: string, limit = 6) {
  const q = normalize(query)
  if (!q) return db.descriptions.orderBy('count').reverse().limit(limit).toArray()
  const hits = await db.descriptions.where('text').startsWith(q).toArray()
  return hits.sort((a, b) => b.count - a.count).slice(0, limit)
}

/* ───────── Transferime ───────── */

export interface NewTransfer {
  fromBudgetId: string
  toBudgetId: string
  amount: number
  date?: string
  note?: string
}

export async function addTransfer(input: NewTransfer): Promise<Transfer> {
  if (input.fromBudgetId === input.toBudgetId) throw new Error('Zgjidh dy buxhete të ndryshme')
  if (!(input.amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
  const date = input.date ?? todayStr()
  const t: Transfer = {
    id: newId(),
    monthKey: monthKeyOf(date),
    fromBudgetId: input.fromBudgetId,
    toBudgetId: input.toBudgetId,
    amount: Math.round(input.amount),
    date,
    createdAt: Date.now(),
    note: input.note?.trim() || undefined,
  }
  await db.transfers.add(t)
  return t
}

export const deleteTransfer = (id: string) => db.transfers.delete(id)

/* ───────── Shpenzime të përsëritura ───────── */

export interface NewRecurring {
  budgetId: string
  categoryId: string
  amount: number
  description: string
  dayOfMonth: number
}

export async function addRecurring(input: NewRecurring): Promise<Recurring> {
  if (!(input.amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
  const r: Recurring = {
    id: newId(),
    ...input,
    dayOfMonth: Math.min(31, Math.max(1, Math.round(input.dayOfMonth))),
    description: input.description.trim(),
    active: true,
  }
  await db.recurring.add(r)
  await runRecurring()
  return r
}

export const setRecurringActive = (id: string, active: boolean) => db.recurring.update(id, { active })
export const deleteRecurring = (id: string) => db.recurring.delete(id)

/**
 * Shton shpenzimet e përsëritura që kanë ardhur data. Idempotent: kontrollon
 * për dublikate brenda transaksionit, kështu dy thirrje paralele nuk e shtojnë dy herë.
 * Kthen sa shpenzime u shtuan.
 */
export async function runRecurring(today: string = todayStr()): Promise<number> {
  return db.transaction('rw', db.recurring, db.expenses, async () => {
    let created = 0
    for (const r of await db.recurring.filter((x) => x.active).toArray()) {
      const dates = pendingDates(r, today)
      for (const date of dates) {
        const monthKey = monthKeyOf(date)
        const exists = await db.expenses
          .where('recurringId')
          .equals(r.id)
          .and((e) => e.monthKey === monthKey)
          .count()
        if (exists) continue
        await db.expenses.add({
          id: newId(),
          monthKey,
          budgetId: r.budgetId,
          categoryId: r.categoryId,
          amount: r.amount,
          description: r.description,
          date,
          createdAt: Date.now(),
          recurringId: r.id,
        })
        created++
      }
      if (dates.length) await db.recurring.update(r.id, { lastRunMonth: monthKeyOf(dates[dates.length - 1]) })
    }
    return created
  })
}
