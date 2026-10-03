import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { seedIfEmpty } from './seed'
import { addExpense, addIncome, remainingFor, suggestDescriptions, undoExpense } from './actions'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedIfEmpty()
})

describe('actions', () => {
  it('rrjedha: të hyra → shpenzim → mbetje → zhbëj', async () => {
    const [home] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'Edi', amount: 30000, date: '2026-10-01', splits: [{ budgetId: home.id, amount: 30000 }] })
    const e = await addExpense({ amount: 1250, description: 'Benzin', budgetId: home.id, categoryId: 'x', date: '2026-10-02' })
    expect(await remainingFor(home.id, '2026-10')).toBe(28750)
    expect((await suggestDescriptions('ben'))[0].display).toBe('Benzin')
    await undoExpense(e)
    expect(await remainingFor(home.id, '2026-10')).toBe(30000)
    expect(await suggestDescriptions('ben')).toHaveLength(0)
  })
  it('refuzon shumë 0 dhe ndarje të gabuar', async () => {
    const [home] = await db.budgets.toArray()
    await expect(addExpense({ amount: 0, description: '', budgetId: home.id, categoryId: 'x' })).rejects.toThrow()
    await expect(addIncome({ source: 'x', amount: 1000, splits: [{ budgetId: home.id, amount: 900 }] })).rejects.toThrow()
  })
})

import { addTransfer, runRecurring } from './actions'

describe('transferime dhe të përsëritura', () => {
  it('transferimi lëviz paratë mes buxheteve', async () => {
    const [h, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'Rrogë', amount: 32000, date: '2026-10-01', splits: [{ budgetId: h.id, amount: 10000 }, { budgetId: p.id, amount: 22000 }] })
    await addTransfer({ fromBudgetId: p.id, toBudgetId: h.id, amount: 2000, date: '2026-10-02' })
    expect(await remainingFor(h.id, '2026-10')).toBe(12000)
    expect(await remainingFor(p.id, '2026-10')).toBe(20000)
    await expect(addTransfer({ fromBudgetId: h.id, toBudgetId: h.id, amount: 1 })).rejects.toThrow()
  })
  it('e përsëritura shtohet një herë, edhe me thirrje paralele', async () => {
    const [h] = await db.budgets.toArray()
    const r = await db.recurring.add({ id: 'r1', budgetId: h.id, categoryId: 'x', amount: 25000, description: 'Qira', dayOfMonth: 5, active: true, lastRunMonth: '2026-08' })
    expect(r).toBe('r1')
    const [a, b] = await Promise.all([runRecurring('2026-10-10'), runRecurring('2026-10-10')])
    expect(a + b).toBe(2) // shtator + tetor
    expect(await db.expenses.count()).toBe(2)
    expect(await runRecurring('2026-10-11')).toBe(0)
  })
})

import { addExpenseWithCover, setLimit } from './actions'

describe('mbulim dhe limite', () => {
  it('mbulimi shton transferim + shpenzim së bashku', async () => {
    const [h, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'x', amount: 10000, date: '2026-10-01', splits: [{ budgetId: h.id, amount: 1000 }, { budgetId: p.id, amount: 9000 }] })
    // Shtëpi ka 10€, shpenzimi 25€ → mbulohet 15€ nga Personal
    await addExpenseWithCover({ amount: 2500, description: 'Fature', budgetId: h.id, categoryId: 'x', date: '2026-10-02' }, { fromBudgetId: p.id, amount: 1500 })
    expect(await remainingFor(h.id, '2026-10')).toBe(0)
    expect(await remainingFor(p.id, '2026-10')).toBe(7500)
    expect((await db.transfers.toArray())[0].note).toBe('Mbulim: Fature')
  })
  it('setLimit vendos dhe heq', async () => {
    await setLimit('c1', 12000)
    expect((await db.limits.get('c1'))?.amount).toBe(12000)
    await setLimit('c1', null)
    expect(await db.limits.get('c1')).toBeUndefined()
  })
})
