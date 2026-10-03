import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { BudgetDB, db } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { addIncome, addPerson, removePerson, renamePerson } from '../db/actions'
import { contributionsByPerson, lastDestination, ME } from './people'
import { resolveSplits } from './split'
import type { Income, IncomeSplit } from '../db/schema'

const inc = (id: string, personId: string | undefined, amount: number, date: string, createdAt = 0): Income => ({ id, monthKey: date.slice(0, 7), personId, source: '', amount, date, createdAt })
const sp = (incomeId: string, budgetId: string, amount: number): IncomeSplit => ({ id: incomeId + budgetId, incomeId, budgetId, monthKey: '2026-10', amount })

describe('contributionsByPerson', () => {
  it('mbledh sipas personit dhe buxhetit', () => {
    const incomes = [inc('1', 'edi', 30000, '2026-10-01'), inc('2', 'edi', 5000, '2026-10-15'), inc('3', undefined, 32000, '2026-10-01'), inc('4', 'mami', 2000, '2026-10-05')]
    const splits = [sp('1', 'h', 30000), sp('2', 'p', 5000), sp('3', 'h', 10000), sp('3', 'p', 22000), sp('4', 'h', 2000)]
    expect(contributionsByPerson(incomes, splits)).toEqual([
      { key: 'edi', total: 35000, count: 2, byBudget: { h: 30000, p: 5000 } },
      { key: ME, total: 32000, count: 1, byBudget: { h: 10000, p: 22000 } },
      { key: 'mami', total: 2000, count: 1, byBudget: { h: 2000 } },
    ])
  })
})

describe('lastDestination', () => {
  it('një buxhet → ai; ndarje → përqindjet që japin të njëjtat shuma', () => {
    const incomes = [inc('1', 'edi', 30000, '2026-09-01'), inc('2', 'edi', 1000, '2026-10-01'), inc('3', undefined, 32000, '2026-10-01')]
    const splits = [sp('1', 'p', 30000), sp('2', 'h', 1000), sp('3', 'h', 10000), sp('3', 'p', 22000)]
    expect(lastDestination('edi', incomes, splits)).toEqual({ kind: 'budget', budgetId: 'h' })
    const me = lastDestination(ME, incomes, splits)
    expect(me).toEqual({ kind: 'split', percents: { h: '31.25', p: '68.75' } })
    // Rroga e muajit tjetër me të njëjtën shumë del saktësisht 100 + 220
    if (me?.kind !== 'split') throw new Error()
    const rows = Object.entries(me.percents).map(([budgetId, value]) => ({ budgetId, mode: 'pct' as const, value }))
    expect(resolveSplits(32000, rows, () => 0)).toEqual({ amounts: { h: 10000, p: 22000 }, unallocated: 0 })
    expect(lastDestination('askush', incomes, splits)).toBeNull()
  })
  it('përqindjet e rrumbullakosura mbledhin gjithmonë 100', () => {
    const d = lastDestination(ME, [inc('1', undefined, 30000, '2026-10-01')], [sp('1', 'a', 10000), sp('1', 'b', 10000), sp('1', 'c', 10000)])
    if (d?.kind !== 'split') throw new Error()
    expect(Object.values(d.percents).reduce((a, v) => a + Number(v), 0)).toBeCloseTo(100, 9)
  })
})

describe('personat në bazë', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedIfEmpty()
  })
  it('shtimi nuk dyfishon emrin; riemërtimi përditëson të hyrat; fshirja arkivon kur ka histori', async () => {
    const [h] = await db.budgets.orderBy('order').toArray()
    const edi = await addPerson('Edi')
    expect((await addPerson(' edi ')).id).toBe(edi.id)
    const mami = await addPerson('Mami')
    await addIncome({ source: 'Edi', personId: edi.id, amount: 30000, date: '2026-10-01', splits: [{ budgetId: h.id, amount: 30000 }] })
    await renamePerson(edi.id, 'Edison')
    expect((await db.incomes.toArray())[0].source).toBe('Edison')
    expect(await removePerson(edi.id)).toBe('archived')
    expect(await removePerson(mami.id)).toBe('deleted')
    expect(await db.people.count()).toBe(1)
    expect((await addPerson('Edison')).archived).toBe(false) // rikthehet nga arkivi
  })
})

describe('migrimi v1 → v2', () => {
  it('burimet me emër bëhen persona; rroga mbetet pa person', async () => {
    const name = 'budgeti-migrim'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(1).stores({ incomes: 'id, monthKey, date', budgets: 'id, order' })
    await old.table('incomes').bulkAdd([
      inc('1', undefined, 30000, '2026-09-01'), inc('2', undefined, 30000, '2026-10-01'), inc('3', undefined, 32000, '2026-10-01'),
    ].map((i, n) => ({ ...i, source: ['Edi', 'edi', 'Rrogë'][n] })))
    old.close()

    const fresh = new BudgetDB(name)
    const people = await fresh.people.toArray()
    expect(people.map((p) => p.name)).toEqual(['Edi'])
    const incomes = await fresh.incomes.orderBy('id').toArray()
    expect(incomes.map((i) => i.personId)).toEqual([people[0].id, people[0].id, undefined])
    expect(await fresh.incomes.where('personId').equals(people[0].id).count()).toBe(2)
    fresh.close()
    await Dexie.delete(name)
  })
})
