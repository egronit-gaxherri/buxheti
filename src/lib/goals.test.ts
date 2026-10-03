import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { addGoal, addIncome, deleteGoal, deleteGoalContribution, goalMove, remainingFor, runGoalAutoSave } from '../db/actions'
import { loadMonthData } from '../db/queries'
import { monthTotals } from './archive'
import { goalProgress, monthlyPace, monthsLeft } from './goals'
import type { Goal } from '../db/schema'

const goal = (p: Partial<Goal>): Goal => ({ id: 'g', name: 'Pushime', icon: '🏖️', color: '', target: 60000, contributions: [], archived: false, createdAt: 0, ...p })
const c = (date: string, amount: number) => ({ id: date + amount, date, amount })

describe('goals (llogaritjet)', () => {
  it('muajt e mbetur numërojnë edhe muajin aktual', () => {
    expect(monthsLeft('2027-07-01', '2026-10-15')).toBe(10)
    expect(monthsLeft('2026-10-31', '2026-10-15')).toBe(1)
    expect(monthsLeft('2026-09-01', '2026-10-15')).toBe(1)
  })
  it('ritmi mujor: mesatarja nga muaji i parë me kursim; muaji aktual pa kursim nuk e ul', () => {
    const g = goal({ contributions: [c('2026-07-05', 10000), c('2026-09-05', 5000)] })
    expect(monthlyPace(g, '2026-10-02')).toBe(5000) // (100 + 0 + 50) / 3 muaj (korrik–shtator)
    expect(monthlyPace(goal({ contributions: [c('2026-10-01', 9000)] }), '2026-10-02')).toBe(9000)
  })
  it('statusi dhe sa duhet në muaj', () => {
    const T = '2026-10-02'
    // 600 € deri në korrik 2027 (10 muaj), 0 të kursyera
    expect(goalProgress(goal({ deadline: '2027-07-01' }), T)).toMatchObject({ status: 'not-started', perMonth: 6000, monthsLeft: 10 })
    // kursen 100 €/muaj → në rregull
    const fast = goalProgress(goal({ deadline: '2027-07-01', contributions: [c('2026-08-05', 10000), c('2026-09-05', 10000)] }), T)
    expect(fast).toMatchObject({ status: 'on-track', saved: 20000, perMonth: 4000 })
    // kursen 20 €/muaj → prapa
    const slow = goalProgress(goal({ deadline: '2027-07-01', contributions: [c('2026-09-05', 2000)] }), T)
    expect(slow.status).toBe('behind')
    expect(slow.projectedMonth! > '2027-07').toBe(true)
    expect(goalProgress(goal({ contributions: [c('2026-09-05', 60000)] }), T).status).toBe('achieved')
    expect(goalProgress(goal({ deadline: '2026-09-30', contributions: [c('2026-09-05', 100)] }), T).status).toBe('overdue')
    expect(goalProgress(goal({ contributions: [c('2026-09-05', 100)] }), T).status).toBe('open')
  })
  it('kur ky muaj ka pasur kursim, mbetja ndahet në muajt pasardhës', () => {
    // 550 € mbeten, tetori u kursye → nëntor–korrik = 9 muaj → 62 €/muaj
    const g = goal({ deadline: '2027-07-01', contributions: [c('2026-10-01', 5000)] })
    expect(goalProgress(g, '2026-10-03')).toMatchObject({ perMonth: 6112, monthsLeft: 9, status: 'behind' })
  })
  it('muaji i parashikuar', () => {
    // mbeten 300 €, ritmi 100 €/muaj, ky muaj ende pa kursim → arrihet pas 3 muajsh duke numëruar këtë
    const g = goal({ target: 40000, contributions: [c('2026-09-05', 10000)] })
    expect(goalProgress(g, '2026-10-02').projectedMonth).toBe('2026-12')
  })
})

describe('goals (baza)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedIfEmpty()
  })
  it('kursimi ul mbetjen e buxhetit pa u bërë shpenzim; tërheqja e kthen; fshirja kthen gjithçka', async () => {
    const [, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'Rrogë', amount: 22000, date: '2026-10-01', splits: [{ budgetId: p.id, amount: 22000 }] })
    const g = await addGoal({ name: 'Pushime', icon: '🏖️', target: 60000 })
    await goalMove(g.id, { amount: 5000, budgetId: p.id, date: '2026-10-02' })
    expect(await remainingFor(p.id, '2026-10')).toBe(17000)
    expect(monthTotals(await loadMonthData('2026-10')).spent).toBe(0)
    await expect(goalMove(g.id, { amount: -6000, budgetId: p.id })).rejects.toThrow('vetëm 50,00')
    const after = await goalMove(g.id, { amount: -2000, budgetId: p.id, date: '2026-10-03' })
    expect(await remainingFor(p.id, '2026-10')).toBe(19000)
    await deleteGoalContribution(g.id, after.contributions[1].id)
    expect(await remainingFor(p.id, '2026-10')).toBe(17000)
    await deleteGoal(g.id)
    expect(await remainingFor(p.id, '2026-10')).toBe(22000)
    expect(await db.adjustments.count()).toBe(0)
  })
  it('kursimi automatik: një herë në muaj, edhe me ekzekutime paralele, pa e kaluar synimin', async () => {
    const [, p] = await db.budgets.orderBy('order').toArray()
    await db.goals.add({ id: 'g1', name: 'Emergjencë', icon: '🆘', color: '', target: 12000, contributions: [], archived: false, createdAt: 0, auto: { amount: 5000, budgetId: p.id, dayOfMonth: 5, lastRunMonth: '2026-07' } })
    await Promise.all([runGoalAutoSave('2026-10-10'), runGoalAutoSave('2026-10-10')])
    let g = (await db.goals.get('g1'))!
    // gusht 50 + shtator 50 + tetor 20 (vetëm sa mungon deri në 120)
    expect(g.contributions.map((x) => x.amount)).toEqual([5000, 5000, 2000])
    expect(g.auto!.lastRunMonth).toBe('2026-10')
    await runGoalAutoSave('2026-10-20')
    g = (await db.goals.get('g1'))!
    expect(g.contributions).toHaveLength(3)
  })
  it('qëllim i ri me kursim automatik nuk shkon prapa në kohë', async () => {
    const [, p] = await db.budgets.orderBy('order').toArray()
    const g = await addGoal({ name: 'Telefon', icon: '📱', target: 50000, auto: { amount: 5000, budgetId: p.id, dayOfMonth: 31 } })
    const saved = (await db.goals.get(g.id))!.contributions.length
    expect(saved).toBeLessThanOrEqual(1) // vetëm muaji aktual, nëse dita ka ardhur
    await expect(addGoal({ name: 'X', icon: '', target: 100, deadline: '2020-01-01' })).rejects.toThrow('të kaluarën')
  })
})
