import { db, newId, PERSON_COLORS } from './db'
import type { Debt, DebtDirection, DebtPayment, Expense, Income, IncomeSplit, Person, Recurring, Transfer } from './schema'
import { budgetEffect, remainingOf } from '../lib/debts'
import { formatEUR } from '../lib/money'
import { monthKeyOf, shiftMonth, todayStr } from '../lib/dates'
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
  personId?: string
  note?: string
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
  const income: Income = {
    id: newId(),
    monthKey,
    personId: input.personId || undefined,
    source: input.source.trim() || 'Të hyra',
    note: input.note?.trim() || undefined,
    amount: input.amount,
    date,
    createdAt: Date.now(),
  }
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

/* ───────── Mbulim me transferim ───────── */

/**
 * Shton shpenzimin dhe, në të njëjtin transaksion, transferon `coverAmount`
 * nga një buxhet tjetër për ta mbuluar. Ose ndodhin të dyja, ose asnjëra.
 */
export async function addExpenseWithCover(input: NewExpense, cover: { fromBudgetId: string; amount: number }) {
  return db.transaction('rw', db.expenses, db.descriptions, db.transfers, async () => {
    const transfer = await addTransfer({
      fromBudgetId: cover.fromBudgetId,
      toBudgetId: input.budgetId,
      amount: cover.amount,
      date: input.date,
      note: `Mbulim: ${input.description.trim() || 'shpenzim'}`,
    })
    const expense = await addExpense(input)
    return { expense, transfer }
  })
}

/* ───────── Limite ───────── */

/** Vendos limitin mujor për një kategori; `null` ose 0 e heq. */
export async function setLimit(categoryId: string, amount: number | null) {
  if (!amount || amount <= 0) await db.limits.delete(categoryId)
  else await db.limits.put({ id: categoryId, categoryId, amount: Math.round(amount) })
}

/* ───────── Import nga shënimet ───────── */

/** Ruan të gjitha shpenzimet e importuara në një transaksion (ose të gjitha, ose asnjë). */
export async function importExpenses(items: NewExpense[]): Promise<Expense[]> {
  return db.transaction('rw', db.expenses, db.descriptions, async () => {
    const out: Expense[] = []
    for (const it of items) out.push(await addExpense(it))
    return out
  })
}

/** Zhbën një import të plotë. */
export async function undoExpenses(expenses: Expense[]): Promise<void> {
  await db.transaction('rw', db.expenses, db.descriptions, async () => {
    for (const e of expenses) await undoExpense(e)
  })
}

/* ───────── Përshtatja e bilancit ───────── */

export type ReconcileMode = 'adjustment' | 'untracked'

export interface ReconcileInput {
  budgetId: string
  /** Sa ke realisht në dorë/llogari për këtë buxhet (cent). */
  actual: number
  /** 'untracked' = shpenzim i pashënuar (vetëm kur mungojnë para); 'adjustment' = korrigjim. */
  mode: ReconcileMode
}

export const UNTRACKED_DESCRIPTION = 'Të pashënuara'

/**
 * Llogarit diferencën mes mbetjes në aplikacion dhe asaj reale dhe e regjistron,
 * kështu që mbetja përputhet saktësisht me `actual`. Punon gjithmonë mbi muajin aktual.
 * Kthen sa regjistrime u krijuan (buxhetet pa diferencë anashkalohen).
 */
export async function reconcileBalances(inputs: ReconcileInput[], fallbackCategoryId: string, today = todayStr()): Promise<number> {
  const monthKey = monthKeyOf(today)
  return db.transaction('rw', [db.adjustments, db.expenses, db.budgets, db.incomeSplits, db.transfers, db.months], async () => {
    const data = await loadMonthData(monthKey)
    let created = 0
    for (const inp of inputs) {
      const diff = inp.actual - summarizeBudget(data, inp.budgetId, today).remaining
      if (diff === 0) continue
      if (diff < 0 && inp.mode === 'untracked') {
        await db.expenses.add({
          id: newId(), monthKey, budgetId: inp.budgetId, categoryId: fallbackCategoryId,
          amount: -diff, description: UNTRACKED_DESCRIPTION, date: today, createdAt: Date.now(),
        })
      } else {
        await db.adjustments.add({ id: newId(), monthKey, budgetId: inp.budgetId, amount: diff, date: today, createdAt: Date.now(), note: 'Korrigjim' })
      }
      created++
    }
    return created
  })
}

export const deleteAdjustment = (id: string) => db.adjustments.delete(id)

/* ───────── Mbyllja e muajit ───────── */

/**
 * Mbyll muajin dhe vendos bartjen (budgetId → cent) si `carryIn` te muaji tjetër.
 * Nëse muaji ishte mbyllur më parë, bartja e vjetër hiqet së pari.
 */
export async function closeMonth(monthKey: string, carry: Record<string, number>): Promise<void> {
  const nextKey = shiftMonth(monthKey, 1)
  await db.transaction('rw', db.months, async () => {
    const cur = (await db.months.get(monthKey)) ?? { monthKey, closed: false, carryIn: {} }
    const next = (await db.months.get(nextKey)) ?? { monthKey: nextKey, closed: false, carryIn: {} }
    const carryIn = { ...next.carryIn }
    for (const id of Object.keys(cur.carried ?? {})) delete carryIn[id]
    for (const [id, amount] of Object.entries(carry)) if (amount !== 0) carryIn[id] = amount
    await db.months.put({ ...next, carryIn })
    await db.months.put({ ...cur, closed: true, carried: carry, closedAt: Date.now() })
  })
}

/** Rihap muajin dhe heq bartjen që kishte dërguar te muaji tjetër. */
export async function reopenMonth(monthKey: string): Promise<void> {
  const nextKey = shiftMonth(monthKey, 1)
  await db.transaction('rw', db.months, async () => {
    const cur = await db.months.get(monthKey)
    if (!cur) return
    const next = await db.months.get(nextKey)
    if (next) {
      const carryIn = { ...next.carryIn }
      for (const id of Object.keys(cur.carried ?? {})) delete carryIn[id]
      await db.months.put({ ...next, carryIn })
    }
    await db.months.put({ ...cur, closed: false, carried: {}, closedAt: undefined })
  })
}

/* ───────── Personat ───────── */

export async function addPerson(name: string): Promise<Person> {
  const n = name.trim()
  if (!n) throw new Error('Shkruaj emrin')
  const existing = (await db.people.toArray()).find((p) => normalize(p.name) === normalize(n))
  if (existing) {
    if (existing.archived) await db.people.update(existing.id, { archived: false })
    return { ...existing, archived: false }
  }
  const p: Person = { id: newId(), name: n, color: PERSON_COLORS[(await db.people.count()) % PERSON_COLORS.length], archived: false, createdAt: Date.now() }
  await db.people.add(p)
  return p
}

/** Riemërton personin dhe përditëson emrin e shfaqur te të hyrat e tij. */
export async function renamePerson(id: string, name: string): Promise<void> {
  const n = name.trim()
  if (!n) throw new Error('Shkruaj emrin')
  await db.transaction('rw', db.people, db.incomes, async () => {
    await db.people.update(id, { name: n })
    await db.incomes.where('personId').equals(id).modify({ source: n })
  })
}

/** Personi me histori fshihet nga lista (arkivohet); pa histori fshihet plotësisht. */
export async function removePerson(id: string): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', db.people, db.incomes, async () => {
    if ((await db.incomes.where('personId').equals(id).count()) > 0) {
      await db.people.update(id, { archived: true })
      return 'archived' as const
    }
    await db.people.delete(id)
    return 'deleted' as const
  })
}

/* ───────── Borxhet ───────── */

export interface NewDebt {
  direction: DebtDirection
  counterparty: string
  personId?: string
  amount: number
  date?: string
  dueDate?: string
  note?: string
  /** Buxheti ku lëvizën paratë; mungon = pa lëvizje (p.sh. borxh i vjetër). */
  budgetId?: string
}

function debtNote(direction: DebtDirection, kind: 'create' | 'payment', who: string) {
  if (kind === 'create') return direction === 'owed_to_me' ? `Borxh: i dhashë hua ${who}` : `Borxh: mora hua nga ${who}`
  return direction === 'owed_to_me' ? `Borxh: më ktheu ${who}` : `Borxh: i ktheva ${who}`
}

export async function addDebt(input: NewDebt): Promise<Debt> {
  const who = input.counterparty.trim()
  if (!who) throw new Error('Shkruaj emrin e personit')
  if (!(input.amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
  if (input.dueDate && input.date && input.dueDate < input.date) throw new Error('Afati s’mund të jetë para datës së borxhit')
  const date = input.date ?? todayStr()
  const debt: Debt = {
    id: newId(),
    direction: input.direction,
    counterparty: who,
    personId: input.personId || undefined,
    amount: Math.round(input.amount),
    date,
    dueDate: input.dueDate || undefined,
    note: input.note?.trim() || undefined,
    budgetId: input.budgetId || undefined,
    payments: [],
    settled: false,
    createdAt: Date.now(),
  }
  await db.transaction('rw', db.debts, db.adjustments, async () => {
    if (debt.budgetId) {
      debt.adjustmentId = newId()
      await db.adjustments.add({
        id: debt.adjustmentId, monthKey: monthKeyOf(date), budgetId: debt.budgetId, date, createdAt: Date.now(),
        amount: budgetEffect(debt.direction, 'create', debt.amount), note: debtNote(debt.direction, 'create', who), debtId: debt.id,
      })
    }
    await db.debts.add(debt)
  })
  return debt
}

/** Regjistron një pagesë (edhe të pjesshme). Kur mbetja bëhet 0, borxhi shënohet i shlyer. */
export async function addDebtPayment(debtId: string, p: { amount: number; date?: string; budgetId?: string; note?: string }): Promise<Debt> {
  return db.transaction('rw', db.debts, db.adjustments, async () => {
    const debt = await db.debts.get(debtId)
    if (!debt) throw new Error('Borxhi nuk u gjet')
    if (debt.settled) throw new Error('Ky borxh është i shlyer')
    const amount = Math.round(p.amount)
    if (!(amount > 0)) throw new Error('Shuma duhet të jetë më e madhe se 0')
    if (amount > remainingOf(debt)) throw new Error(`Pagesa kalon mbetjen e borxhit (${formatEUR(remainingOf(debt))})`)
    const date = p.date ?? todayStr()
    const pay: DebtPayment = { id: newId(), amount, date, budgetId: p.budgetId || undefined, note: p.note?.trim() || undefined }
    if (pay.budgetId) {
      pay.adjustmentId = newId()
      await db.adjustments.add({
        id: pay.adjustmentId, monthKey: monthKeyOf(date), budgetId: pay.budgetId, date, createdAt: Date.now(),
        amount: budgetEffect(debt.direction, 'payment', amount), note: debtNote(debt.direction, 'payment', debt.counterparty), debtId,
      })
    }
    const payments = [...debt.payments, pay]
    const done = payments.reduce((a, x) => a + x.amount, 0) >= debt.amount
    const next: Debt = { ...debt, payments, settled: done, settledAt: done ? Date.now() : undefined }
    await db.debts.put(next)
    return next
  })
}

/** Fshin një pagesë dhe lëvizjen e saj në buxhet; borxhi rihapet nëse kishte mbetje. */
export async function deleteDebtPayment(debtId: string, paymentId: string): Promise<void> {
  await db.transaction('rw', db.debts, db.adjustments, async () => {
    const debt = await db.debts.get(debtId)
    const pay = debt?.payments.find((x) => x.id === paymentId)
    if (!debt || !pay) return
    if (pay.adjustmentId) await db.adjustments.delete(pay.adjustmentId)
    const payments = debt.payments.filter((x) => x.id !== paymentId)
    const done = payments.reduce((a, x) => a + x.amount, 0) >= debt.amount
    await db.debts.put({ ...debt, payments, settled: done, settledAt: done ? debt.settledAt : undefined })
  })
}

/** Mbyll borxhin pa pagesë (p.sh. u fal), ose e rihap. */
export async function setDebtSettled(debtId: string, settled: boolean): Promise<void> {
  const debt = await db.debts.get(debtId)
  if (!debt) return
  if (!settled && remainingOf(debt) === 0) throw new Error('Borxhi është paguar plotësisht')
  await db.debts.update(debtId, { settled, settledAt: settled ? Date.now() : undefined })
}

/** Fshin borxhin bashkë me të gjitha lëvizjet e tij në buxhet. */
export async function deleteDebt(debtId: string): Promise<void> {
  await db.transaction('rw', db.debts, db.adjustments, async () => {
    await db.adjustments.where('debtId').equals(debtId).delete()
    await db.debts.delete(debtId)
  })
}
