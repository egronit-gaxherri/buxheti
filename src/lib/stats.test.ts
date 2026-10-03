import { describe, expect, it } from 'vitest'
import { compareMonths, dailySpending, forecastBudget, limitCrossing, limitLevel, spendingByCategory, upcomingRecurring } from './stats'
import type { Expense } from '../db/schema'

const ex = (date: string, amount: number, categoryId = 'c', recurringId?: string): Expense => ({
  id: date + amount, monthKey: date.slice(0, 7), budgetId: 'h', categoryId, amount, description: '', date, createdAt: 0, recurringId,
})

describe('grafikë', () => {
  it('sipas kategorisë, më e madhja së pari', () => {
    expect(spendingByCategory([ex('2026-10-01', 100, 'a'), ex('2026-10-02', 500, 'b'), ex('2026-10-03', 50, 'a')])).toEqual([
      { categoryId: 'b', amount: 500 }, { categoryId: 'a', amount: 150 },
    ])
  })
  it('shpenzimi ditor', () => {
    const d = dailySpending([ex('2026-10-02', 100), ex('2026-10-02', 50), ex('2026-10-31', 7)], '2026-10')
    expect(d).toHaveLength(31)
    expect([d[1], d[30], d[0]]).toEqual([150, 7, 0])
  })
  it('krahasimi me muajin e kaluar deri në të njëjtën ditë', () => {
    const cur = [ex('2026-10-02', 3000)]
    const prev = [ex('2026-09-01', 1000), ex('2026-09-02', 1000), ex('2026-09-20', 5000)]
    const c = compareMonths(cur, prev, 3)
    expect(c).toMatchObject({ current: 3000, previous: 7000, previousSameDay: 2000, deltaPct: 50 })
    expect(compareMonths(cur, [], 3).deltaPct).toBeNull()
  })
})

describe('forecastBudget', () => {
  const base = { monthKey: '2026-10', today: '2026-10-10', remaining: 20000, upcomingFixed: 0 }
  it('paratë mbarojnë para fundit të muajit', () => {
    // 10 ditë, 30€ → 3€/ditë; 200€ / 3€ ≈ 66 ditë → ok. Me 100€ shpenzuar: 10€/ditë → 20 ditë → dita 30
    const f = forecastBudget({ ...base, expenses: [ex('2026-10-05', 10000)] })
    expect(f).toEqual({ kind: 'runout', date: '2026-10-30', reason: 'rate' })
  })
  it('ritëm i ulët → ok me mbetje të parashikuar', () => {
    const f = forecastBudget({ ...base, expenses: [ex('2026-10-05', 1000)] })
    expect(f).toEqual({ kind: 'ok', projectedLeft: 20000 - 100 * 21 })
  })
  it('shpenzimet e përsëritura nuk shtrihen, por ato që vijnë zbriten', () => {
    const f = forecastBudget({ ...base, expenses: [ex('2026-10-05', 1000), ex('2026-10-05', 15000, 'c', 'r')], remaining: 20000, upcomingFixed: 15000 })
    expect(f).toEqual({ kind: 'ok', projectedLeft: 5000 - 100 * 21 })
  })
  it('s’ka parashikim me pak të dhëna ose muaj të kaluar', () => {
    expect(forecastBudget({ ...base, today: '2026-10-02', expenses: [ex('2026-10-01', 5000)] }).kind).toBe('none')
    expect(forecastBudget({ ...base, monthKey: '2026-09', expenses: [] }).kind).toBe('none')
  })
  it('mbetje 0 → empty; e përsëritura e pambuluar → fixed', () => {
    expect(forecastBudget({ ...base, remaining: 0, expenses: [] }).kind).toBe('empty')
    expect(forecastBudget({ ...base, upcomingFixed: 30000, expenses: [] })).toMatchObject({ kind: 'runout', reason: 'fixed' })
  })
  it('upcomingRecurring', () => {
    const r = { id: 'r', budgetId: 'h', categoryId: 'c', amount: 500, description: '', dayOfMonth: 20, active: true }
    expect(upcomingRecurring([r], 'h', '2026-10-10')).toBe(500)
    expect(upcomingRecurring([{ ...r, lastRunMonth: '2026-10' }], 'h', '2026-10-10')).toBe(0)
    expect(upcomingRecurring([r], 'h', '2026-10-25')).toBe(0)
    expect(upcomingRecurring([r], 'p', '2026-10-10')).toBe(0)
  })
})

describe('limite', () => {
  it('nivelet', () => {
    expect([limitLevel(7900, 10000), limitLevel(8000, 10000), limitLevel(10000, 10000), limitLevel(5, 0)]).toEqual(['ok', 'warn', 'over', 'ok'])
  })
  it('alarmi shfaqet vetëm kur kalohet pragu', () => {
    expect(limitCrossing(7000, 8500, 10000)).toBe('warn')
    expect(limitCrossing(8500, 9000, 10000)).toBeNull()
    expect(limitCrossing(9000, 10500, 10000)).toBe('over')
    expect(limitCrossing(7000, 11000, 10000)).toBe('over')
    expect(limitCrossing(10500, 11000, 10000)).toBeNull()
  })
})
