import { describe, expect, it } from 'vitest'
import { resolveSplits, type SplitRow } from './split'
import { parseAmount } from './money'
import { pendingDates } from './recurring'

const eur = (s: string) => parseAmount(s) ?? 0
const row = (budgetId: string, mode: 'eur' | 'pct', value: string): SplitRow => ({ budgetId, mode, value })

describe('resolveSplits', () => {
  it('rroga 320 → 100 Shtëpi + 220 Personal', () => {
    const r = resolveSplits(32000, [row('h', 'eur', '100'), row('p', 'eur', '220')], eur)
    expect(r.amounts).toEqual({ h: 10000, p: 22000 })
    expect(r.unallocated).toBe(0)
  })
  it('Edi 300 → 100% Shtëpi', () => {
    const r = resolveSplits(30000, [row('h', 'pct', '100'), row('p', 'pct', '')], eur)
    expect(r.amounts).toEqual({ h: 30000 })
    expect(r.unallocated).toBe(0)
  })
  it('përqindjet që bëjnë 100% mbledhin saktësisht', () => {
    const r = resolveSplits(1001, [row('a', 'pct', '50'), row('b', 'pct', '50')], eur)
    expect(r.amounts.a + r.amounts.b).toBe(1001)
    const t = resolveSplits(1000, [row('a', 'pct', '33.33'), row('b', 'pct', '33.33'), row('c', 'pct', '33.34')], eur)
    expect(Object.values(t.amounts).reduce((x, y) => x + y)).toBe(1000)
  })
  it('përzierje € + % dhe mbetje pa ndarë', () => {
    const r = resolveSplits(32000, [row('h', 'eur', '100'), row('p', 'pct', '50')], eur)
    expect(r.amounts).toEqual({ h: 10000, p: 16000 })
    expect(r.unallocated).toBe(6000)
  })
})

describe('pendingDates', () => {
  const rec = { id: 'r', budgetId: 'h', categoryId: 'c', amount: 100, description: 'Qira', dayOfMonth: 5, active: true }
  it('shabllon i ri: vetëm muaji aktual, kur dita ka ardhur', () => {
    expect(pendingDates(rec, '2026-10-03')).toEqual([])
    expect(pendingDates(rec, '2026-10-05')).toEqual(['2026-10-05'])
  })
  it('rimerr muajt e humbur', () => {
    expect(pendingDates({ ...rec, lastRunMonth: '2026-07' }, '2026-10-10')).toEqual(['2026-08-05', '2026-09-05', '2026-10-05'])
  })
  it('nuk përsërit muajin e kryer', () => {
    expect(pendingDates({ ...rec, lastRunMonth: '2026-10' }, '2026-10-20')).toEqual([])
  })
  it('dita 31 në muaj me 30 ditë', () => {
    expect(pendingDates({ ...rec, dayOfMonth: 31, lastRunMonth: '2026-09' }, '2026-11-30')).toEqual(['2026-10-31', '2026-11-30'])
  })
})
