import { describe, expect, it } from 'vitest'
import { categoryAnomalies, computeInsights, frequentSmall, noSpendDays, savingsRate, subscriptionCandidates, topCategory, weekSummary, type InsightInput } from './insights'
import type { Expense } from '../db/schema'

let n = 0
const ex = (date: string, amount: number, description = 'x', categoryId = 'u', extra: Partial<Expense> = {}): Expense => ({
  id: String(n++), monthKey: date.slice(0, 7), budgetId: 'h', categoryId, amount, description, date, createdAt: n, ...extra,
})
const cats = [{ id: 'u', name: 'Ushqim', icon: '', keywords: [] }, { id: 'k', name: 'Karburant', icon: '', keywords: [] }, { id: 'a', name: 'Argëtim', icon: '', keywords: [] }]
const input = (expenses: Expense[], p: Partial<InsightInput> = {}): InsightInput => ({ today: '2026-10-15', expenses, incomeSplits: [], categories: cats, recurring: [], ...p })

describe('categoryAnomalies', () => {
  const history = ['2026-07', '2026-08', '2026-09'].flatMap((mk) => [ex(`${mk}-05`, 3000, 'Benzin', 'k'), ex(`${mk}-25`, 9000, 'Benzin', 'k')])
  it('më shumë se zakonisht deri në të njëjtën ditë (pa numëruar pjesën pas datës 15)', () => {
    const r = categoryAnomalies(input([...history, ex('2026-10-03', 3000, 'Benzin', 'k'), ex('2026-10-12', 2000, 'Benzin', 'k')]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tone: 'warn', title: 'Karburant: 67% më shumë se zakonisht' })
    expect(r[0].detail).toContain('50,00 €')
    expect(r[0].detail).toContain('30,00 €')
  })
  it('më pak se zakonisht → lajm i mirë; pa histori → asgjë', () => {
    const many = ['2026-07', '2026-08', '2026-09'].flatMap((mk) => [ex(`${mk}-02`, 4000, 'Market'), ex(`${mk}-10`, 4000, 'Market')])
    expect(categoryAnomalies(input([...many, ex('2026-10-02', 2000, 'Market')]))[0]).toMatchObject({ tone: 'good' })
    expect(categoryAnomalies(input([ex('2026-10-02', 99999)]))).toEqual([])
  })
  it('shpenzimet e përsëritura (fikse) nuk llogariten', () => {
    // qiraja 500 € nuk e bën karburantin "më shumë se zakonisht"; pa të, karburanti është 0 → "më pak"
    const r = categoryAnomalies(input([...history, ex('2026-10-01', 50000, 'Qira', 'k', { recurringId: 'r' })]))
    expect(r.map((i) => i.tone)).toEqual(['good'])
  })
})

describe('subscriptionCandidates', () => {
  it('njeh pagesë mujore të qëndrueshme dhe propozon ta bëjë të përsëritur', () => {
    const r = subscriptionCandidates(input(['2026-07-12', '2026-08-12', '2026-09-13', '2026-10-12'].map((d) => ex(d, 1299, 'Netflix', 'a'))))
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Duket si abonim: Netflix 12,99 €/muaj')
    expect(r[0].action).toMatchObject({ kind: 'make-recurring', amount: 1299, dayOfMonth: 12, categoryId: 'a' })
  })
  it('jo kur shuma ndryshon shumë, kur blihet shpesh, ose kur është tashmë e përsëritur', () => {
    expect(subscriptionCandidates(input(['2026-08-12', '2026-09-12', '2026-10-12'].map((d, i) => ex(d, [1000, 2500, 1000][i], 'Market'))))).toEqual([])
    expect(subscriptionCandidates(input(['2026-08', '2026-09', '2026-10'].flatMap((mk) => [3, 9, 18].map((d) => ex(`${mk}-${String(d).padStart(2, '0')}`, 300, 'Bukë')))))).toEqual([])
    const rec = [{ id: 'r', budgetId: 'h', categoryId: 'a', amount: 1299, description: 'netflix', dayOfMonth: 12, active: true }]
    expect(subscriptionCandidates(input(['2026-08-12', '2026-09-12', '2026-10-12'].map((d) => ex(d, 1299, 'Netflix')), { recurring: rec }))).toEqual([])
  })
})

describe('vëzhgime të tjera', () => {
  it('blerje të vogla të shpeshta me koston vjetore', () => {
    const r = frequentSmall(input(Array.from({ length: 10 }, (_, i) => ex(`2026-10-${String(i + 1).padStart(2, '0')}`, 150, 'Kafe'))))
    expect(r[0].title).toBe('Kafe: 10 herë këtë muaj')
    expect(r[0].detail).toContain('15,00 €')
    expect(r[0].detail).toContain('365,00 €') // 15 € / 15 ditë × 365
  })
  it('përqindja e kursimit', () => {
    const splits = [{ id: 's', incomeId: 'i', budgetId: 'h', monthKey: '2026-10', amount: 100000 }, { id: 's2', incomeId: 'j', budgetId: 'h', monthKey: '2026-09', amount: 100000 }]
    const r = savingsRate(input([ex('2026-10-02', 70000), ex('2026-09-02', 90000)], { incomeSplits: splits }))
    expect(r[0]).toMatchObject({ tone: 'good', title: 'Po kursen 30% të të hyrave' })
    expect(r[0].detail).toContain('muajin e kaluar 10%')
    expect(savingsRate(input([ex('2026-10-02', 120000)], { incomeSplits: splits }))[0].tone).toBe('warn')
    expect(savingsRate(input([]))).toEqual([])
  })
  it('ditët pa shpenzime dhe kategoria dominuese', () => {
    expect(noSpendDays(input([ex('2026-10-01', 100), ex('2026-10-02', 100)]))[0].title).toBe('12 ditë pa asnjë shpenzim këtë muaj')
    expect(topCategory(input([ex('2026-10-02', 8000, 'Qira', 'k'), ex('2026-10-03', 2000)]))[0].title).toBe('Karburant merr 80% të shpenzimeve')
  })
  it('renditja dhe fshehja', () => {
    const exps = [...['2026-07-12', '2026-08-12', '2026-09-12', '2026-10-12'].map((d) => ex(d, 1299, 'Netflix', 'a')), ex('2026-10-01', 100)]
    const all = computeInsights(input(exps))
    expect(all[0].id).toBe('sub:netflix') // veprimi para lajmeve informuese pa veprim
    expect(computeInsights(input(exps), ['sub:netflix']).some((i) => i.id === 'sub:netflix')).toBe(false)
  })
  it('përmbledhja e javës', () => {
    const w = weekSummary([ex('2026-10-15', 1000), ex('2026-10-09', 3000, 'b', 'k'), ex('2026-10-08', 4000), ex('2026-10-01', 9999)], '2026-10-15')
    expect(w).toMatchObject({ from: '2026-10-09', total: 4000, previous: 4000, deltaPct: 0, count: 2, topCategoryId: 'k', topAmount: 3000 })
  })
})
