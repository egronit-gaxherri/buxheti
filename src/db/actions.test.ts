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
