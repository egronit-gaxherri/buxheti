import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { BudgetDB, db } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { addDebt, addDebtPayment, addIncome, deleteDebt, deleteDebtPayment, remainingFor, setDebtSettled } from '../db/actions'
import { loadMonthData } from '../db/queries'
import { monthTotals } from './archive'
import { budgetEffect, daysUntilDue, debtStatus, debtTotals, remainingOf, sortDebts } from './debts'
import type { Debt } from '../db/schema'

const debt = (p: Partial<Debt>): Debt => ({
  id: 'd', direction: 'owed_to_me', counterparty: 'Edi', amount: 10000, date: '2026-10-01', payments: [], settled: false, createdAt: 0, ...p,
})

describe('debts (logjika)', () => {
  it('mbetja dhe statusi sipas afatit', () => {
    const T = '2026-10-10'
    expect(remainingOf(debt({ payments: [{ id: '1', amount: 3000, date: T }] }))).toBe(7000)
    expect(debtStatus(debt({}), T)).toBe('open')
    expect(debtStatus(debt({ dueDate: '2026-10-13' }), T)).toBe('due-soon')
    expect(debtStatus(debt({ dueDate: '2026-10-14' }), T)).toBe('open')
    expect(debtStatus(debt({ dueDate: '2026-10-09' }), T)).toBe('overdue')
    expect(debtStatus(debt({ dueDate: '2026-10-09', settled: true }), T)).toBe('settled')
    expect(debtStatus(debt({ payments: [{ id: '1', amount: 10000, date: T }] }), T)).toBe('settled')
    expect([daysUntilDue(debt({ dueDate: '2026-10-11' }), T), daysUntilDue(debt({}), T)]).toEqual([1, null])
  })
  it('totalet: vetëm mbetjet e borxheve të hapura', () => {
    const t = debtTotals([
      debt({ id: '1', amount: 10000, payments: [{ id: 'p', amount: 2500, date: '' }] }),
      debt({ id: '2', direction: 'i_owe', amount: 3000 }),
      debt({ id: '3', amount: 99900, settled: true }),
    ])
    expect(t).toEqual({ owedToMe: 7500, iOwe: 3000, net: 4500 })
  })
  it('shenja e lëvizjes në buxhet', () => {
    expect(budgetEffect('owed_to_me', 'create', 100)).toBe(-100) // i dhashë hua
    expect(budgetEffect('owed_to_me', 'payment', 100)).toBe(100) // më ktheu
    expect(budgetEffect('i_owe', 'create', 100)).toBe(100) // mora hua
    expect(budgetEffect('i_owe', 'payment', 100)).toBe(-100) // i ktheva
  })
  it('renditja: me afat të kaluar së pari, të shlyerat në fund', () => {
    const T = '2026-10-10'
    const ids = sortDebts([
      debt({ id: 'settled', settled: true }), debt({ id: 'nodue' }), debt({ id: 'later', dueDate: '2026-11-01' }),
      debt({ id: 'overdue', dueDate: '2026-10-01' }), debt({ id: 'soon', dueDate: '2026-10-11' }),
    ], T).map((d) => d.id)
    expect(ids).toEqual(['overdue', 'soon', 'later', 'nodue', 'settled'])
  })
})

describe('debts (baza)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedIfEmpty()
  })

  it('i dhashë hua nga Personal → mbetja bie, por s’është shpenzim; pagesat e kthejnë', async () => {
    const [, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'Rrogë', amount: 22000, date: '2026-10-01', splits: [{ budgetId: p.id, amount: 22000 }] })
    const d = await addDebt({ direction: 'owed_to_me', counterparty: 'Edi', amount: 5000, date: '2026-10-02', dueDate: '2026-10-20', budgetId: p.id })
    expect(await remainingFor(p.id, '2026-10')).toBe(17000)
    expect(monthTotals(await loadMonthData('2026-10'))).toMatchObject({ income: 22000, spent: 0 }) // statistikat të paprekura

    await addDebtPayment(d.id, { amount: 2000, date: '2026-10-05', budgetId: p.id })
    expect(await remainingFor(p.id, '2026-10')).toBe(19000)
    await expect(addDebtPayment(d.id, { amount: 3001 })).rejects.toThrow('kalon mbetjen')
    const done = await addDebtPayment(d.id, { amount: 3000, date: '2026-10-06', budgetId: p.id })
    expect(done.settled).toBe(true)
    expect(await remainingFor(p.id, '2026-10')).toBe(22000)
    await expect(addDebtPayment(d.id, { amount: 1 })).rejects.toThrow('i shlyer')

    // fshirja e pagesës rihap borxhin dhe heq lëvizjen
    await deleteDebtPayment(d.id, done.payments[1].id)
    const again = (await db.debts.get(d.id))!
    expect([again.settled, remainingOf(again)]).toEqual([false, 3000])
    expect(await remainingFor(p.id, '2026-10')).toBe(19000)

    await deleteDebt(d.id)
    expect(await db.adjustments.count()).toBe(0)
    expect(await remainingFor(p.id, '2026-10')).toBe(22000)
  })

  it('mora hua pa lëvizje në buxhet; falja dhe rihapja', async () => {
    const d = await addDebt({ direction: 'i_owe', counterparty: 'Babi', amount: 10000 })
    expect(await db.adjustments.count()).toBe(0)
    await setDebtSettled(d.id, true)
    expect((await db.debts.get(d.id))!.settled).toBe(true)
    await setDebtSettled(d.id, false)
    expect((await db.debts.get(d.id))!.settled).toBe(false)
  })

  it('validimi', async () => {
    await expect(addDebt({ direction: 'i_owe', counterparty: ' ', amount: 100 })).rejects.toThrow('emrin')
    await expect(addDebt({ direction: 'i_owe', counterparty: 'X', amount: 0 })).rejects.toThrow('Shuma')
    await expect(addDebt({ direction: 'i_owe', counterparty: 'X', amount: 100, date: '2026-10-10', dueDate: '2026-10-01' })).rejects.toThrow('Afati')
  })
})

describe('migrimi v2 → v3', () => {
  it('borxhet e vjetra marrin payments: [] dhe datë', async () => {
    const name = 'budgeti-migrim-v3'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(2).stores({ debts: 'id, direction, dueDate', adjustments: 'id, monthKey, budgetId' })
    await old.table('debts').add({ id: 'x', direction: 'i_owe', counterparty: 'Edi', amount: 500, settled: false, createdAt: Date.UTC(2026, 8, 5) })
    old.close()
    const fresh = new BudgetDB(name)
    const d = (await fresh.debts.get('x'))!
    expect(d.payments).toEqual([])
    expect(d.date).toBe('2026-09-05')
    fresh.close()
    await Dexie.delete(name)
  })
})
