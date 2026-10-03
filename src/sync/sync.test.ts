import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { BudgetDB, db as A } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { addExpense, addIncome, addTransfer, closeMonth, deleteExpense, runRecurring, updateExpense } from '../db/actions'
import { loadMonthData } from '../db/queries'
import { summarizeBudget } from '../lib/calc'
import { contributionsByPerson, ME } from '../lib/people'
import { MemoryRemote, RemoteError } from './remote'
import { localChanges } from './engine'
import { createHousehold, getSyncConfig, joinHousehold, leaveHousehold, runSync, type HouseholdApi } from './household'
import type { Budget } from '../db/schema'

/** Një "server" i përbashkët për dy pajisje. */
function memoryApi() {
  const remote = new MemoryRemote()
  let n = 0
  const ident = (name: string) => ({ household_id: 'h1', household_name: name, join_code: 'KOD123', member_id: `m${++n}`, member_token: `tok${n}` })
  const api: HouseholdApi = {
    create: async (name) => ident(name),
    join: async (code) => {
      if (code !== 'KOD123') throw new RemoteError('invalid_code', 'Kodi i ftesës është i gabuar.')
      return ident('Shtëpia jonë')
    },
    leave: async () => undefined,
    remote: () => remote,
  }
  return { api, remote }
}

let B: BudgetDB
const M = '2026-10'
const remainingOf = async (dbx: BudgetDB, budgetId: string, mk = M) => summarizeBudget(await loadMonthData(mk, dbx), budgetId, '2026-10-03').remaining
const budgetsOf = async (dbx: BudgetDB) => (await dbx.budgets.orderBy('order').toArray()) as Budget[]
/** Sinkronizon të dyja derisa s'ka më asgjë për të lëvizur (ose dështon nëse s'konvergjojnë). */
async function settle(api: HouseholdApi) {
  for (let i = 0; i < 6; i++) {
    const [ra, rb] = [await runSync(A, api), await runSync(B, api)]
    if (ra!.pushed + ra!.pulled + rb!.pushed + rb!.pulled === 0) return i
  }
  throw new Error('sinkronizimi nuk konvergjoi')
}

beforeEach(async () => {
  await Promise.all(A.tables.map((t) => t.clear()))
  await seedIfEmpty(A)
  if (B) B.close()
  await Dexie.delete('device-b')
  B = new BudgetDB('device-b')
  await seedIfEmpty(B)
})

describe('sinkronizimi i familjes (dy pajisje)', () => {
  it('Shtëpia ndahet, Personal jo; të njëjtat shuma në të dy telefonat', async () => {
    const { api, remote } = memoryApi()
    const [home, personal] = await budgetsOf(A)
    const catA = (await A.categories.toArray()).find((c) => c.name === 'Ushqim')!
    await addIncome({ source: 'Rrogë', amount: 32000, date: '2026-10-01', splits: [{ budgetId: home.id, amount: 10000 }, { budgetId: personal.id, amount: 22000 }] })
    await addExpense({ amount: 1250, description: 'Bukë', budgetId: home.id, categoryId: catA.id, date: '2026-10-02' })
    await addExpense({ amount: 999, description: 'Kinema', budgetId: personal.id, categoryId: catA.id, date: '2026-10-02' })
    await addTransfer({ fromBudgetId: personal.id, toBudgetId: home.id, amount: 2000, date: '2026-10-02' })

    await createHousehold(A, api, { householdName: 'Shtëpia jonë', memberName: 'Egronit', sharedBudgetIds: [home.id] })

    // B ka të dhënat e veta: Shtëpi + Personal me id të tjera, dhe një shpenzim në Shtëpi
    const [homeB0] = await budgetsOf(B)
    const catB = (await B.categories.toArray()).find((c) => c.name === 'Ushqim')!
    await B.expenses.add({ id: 'b-exp', monthKey: M, budgetId: homeB0.id, categoryId: catB.id, amount: 500, description: 'Qumësht', date: '2026-10-02', createdAt: 1 })

    await joinHousehold(B, api, { code: 'KOD123', memberName: 'Arta' })
    await settle(api)

    // Buxheti "Shtëpi" i B u bë ai i familjes; Personal i B mbeti i veti
    const [homeB, personalB] = await budgetsOf(B)
    expect(homeB.id).toBe(home.id)
    expect(homeB.shared).toBe(true)
    expect(personalB.id).not.toBe(personal.id)
    expect(personalB.shared).toBeFalsy()

    // E njëjta mbetje e Shtëpisë: 100 + 20 − 12,50 − 5 = 102,50
    expect(await remainingOf(A, home.id)).toBe(10250)
    expect(await remainingOf(B, home.id)).toBe(10250)

    // Kategoria e B u lidh me atë të A; shpenzimi i B tregon kush e shtoi
    const bExpOnA = (await A.expenses.get('b-exp'))!
    expect(bExpOnA.categoryId).toBe(catA.id)
    expect(bExpOnA.addedBy).toBe('Arta')
    expect((await B.categories.toArray()).filter((c) => c.name === 'Ushqim')).toHaveLength(1)

    // Personal i A nuk del kurrë nga telefoni: as shpenzimi, as buxheti, as ndarja 220€
    const server = [...remote.rows.values()]
    expect(server.some((r) => r.type === 'expense' && (r.data as { description: string }).description === 'Kinema')).toBe(false)
    expect(server.some((r) => r.type === 'budget' && r.id === personal.id)).toBe(false)
    expect(server.some((r) => r.type === 'split' && (r.data as { amount: number }).amount === 22000)).toBe(false)

    // Te B: rroga e A shfaqet si 100€ nga "Egronit", jo si "Unë"
    const cfgB = (await getSyncConfig(B))!
    const contribB = contributionsByPerson(await B.incomes.toArray(), await B.incomeSplits.toArray(), cfgB.myPersonId)
    const egronit = (await B.people.toArray()).find((p) => p.name === 'Egronit')!
    expect(contribB).toEqual([{ key: egronit.id, total: 10000, count: 1, byBudget: { [home.id]: 10000 } }])
    // Te A: rroga e vet mbetet "Unë", e plotë 320€
    const cfgA = (await getSyncConfig(A))!
    expect(contributionsByPerson(await A.incomes.toArray(), await A.incomeSplits.toArray(), cfgA.myPersonId)[0]).toMatchObject({ key: ME, total: 32000 })

    // Konvergjencë: asnjë ndryshim i mbetur për t'u ngarkuar
    expect(await localChanges(A, cfgA)).toEqual([])
    expect(await localChanges(B, cfgB)).toEqual([])
  })

  it('ndryshimet dhe fshirjet kalojnë në të dy drejtimet', async () => {
    const { api } = memoryApi()
    const [home] = await budgetsOf(A)
    const cats = await A.categories.toArray()
    const e = await addExpense({ amount: 1000, description: 'Bukë', budgetId: home.id, categoryId: cats[0].id, date: '2026-10-02' })
    await createHousehold(A, api, { householdName: 'F', memberName: 'Egronit', sharedBudgetIds: [home.id] })
    await joinHousehold(B, api, { code: 'KOD123', memberName: 'Arta' })

    await B.expenses.update(e.id, { categoryId: cats[1].id, note: 'ndryshuar nga Arta' })
    await settle(api)
    expect((await A.expenses.get(e.id))).toMatchObject({ categoryId: cats[1].id, note: 'ndryshuar nga Arta', addedBy: 'Egronit' })

    await deleteExpense(e.id)
    await settle(api)
    expect(await B.expenses.get(e.id)).toBeUndefined()
  })

  it('konflikt: të dy ndryshojnë të njëjtin shpenzim — fiton i fundit që sinkronizon, dhe konvergjojnë', async () => {
    const { api } = memoryApi()
    const [home] = await budgetsOf(A)
    const cat = (await A.categories.toArray())[0]
    const e = await addExpense({ amount: 1000, description: 'Bukë', budgetId: home.id, categoryId: cat.id, date: '2026-10-02' })
    await createHousehold(A, api, { householdName: 'F', memberName: 'Egronit', sharedBudgetIds: [home.id] })
    await joinHousehold(B, api, { code: 'KOD123', memberName: 'Arta' })
    await updateExpense(e.id, { note: 'A' })
    await B.expenses.update(e.id, { note: 'B' })
    await runSync(A, api) // A ngarkon e para
    await runSync(B, api) // B ka ndryshim të pangarkuar → e mban dhe e ngarkon
    await settle(api)
    expect((await A.expenses.get(e.id))!.note).toBe('B')
    expect((await B.expenses.get(e.id))!.note).toBe('B')
  })

  it('shpenzimet e përsëritura nuk dyfishohen kur të dy telefonat i gjenerojnë', async () => {
    const { api } = memoryApi()
    const [home] = await budgetsOf(A)
    await A.recurring.add({ id: 'qira', budgetId: home.id, categoryId: 'x', amount: 25000, description: 'Qira', dayOfMonth: 1, active: true, lastRunMonth: '2026-09' })
    await createHousehold(A, api, { householdName: 'F', memberName: 'Egronit', sharedBudgetIds: [home.id] })
    await joinHousehold(B, api, { code: 'KOD123', memberName: 'Arta' })
    await B.recurring.update('qira', { lastRunMonth: '2026-09' }) // B s'e ka marrë ende ekzekutimin e A
    await runRecurring('2026-10-03')
    // B gjeneron vetë (pa ditur për A) me motorin në bazën e vet
    const r = (await B.recurring.get('qira'))!
    await B.expenses.put({ id: `rec:qira:${M}`, monthKey: M, budgetId: home.id, categoryId: 'x', amount: 25000, description: 'Qira', date: '2026-10-01', createdAt: new Date(2026, 9, 1).getTime(), recurringId: r.id })
    await settle(api)
    expect((await A.expenses.where('recurringId').equals('qira').toArray()).length).toBe(1)
    expect((await B.expenses.where('recurringId').equals('qira').toArray()).length).toBe(1)
  })

  it('bartja e muajit për Shtëpinë kalon; ajo e Personal-it jo', async () => {
    const { api } = memoryApi()
    const [home, personal] = await budgetsOf(A)
    await createHousehold(A, api, { householdName: 'F', memberName: 'Egronit', sharedBudgetIds: [home.id] })
    await joinHousehold(B, api, { code: 'KOD123', memberName: 'Arta' })
    await closeMonth('2026-09', { [home.id]: 4000, [personal.id]: 9900 })
    await settle(api)
    expect((await B.months.get('2026-10'))!.carryIn).toEqual({ [home.id]: 4000 })
    expect(await remainingOf(B, home.id)).toBe(4000)
  })

  it('kodi i gabuar refuzohet pa prekur bazën; largimi ndalon sinkronizimin', async () => {
    const { api } = memoryApi()
    const [home] = await budgetsOf(A)
    await createHousehold(A, api, { householdName: 'F', memberName: 'Egronit', sharedBudgetIds: [home.id] })
    const before = (await B.budgets.toArray()).map((b) => b.id).sort()
    await expect(joinHousehold(B, api, { code: 'GABIM', memberName: 'Arta' })).rejects.toThrow('Kodi i ftesës')
    expect((await B.budgets.toArray()).map((b) => b.id).sort()).toEqual(before)
    expect(await getSyncConfig(B)).toBeUndefined()

    await leaveHousehold(A, api)
    expect(await getSyncConfig(A)).toBeUndefined()
    expect((await A.budgets.toArray()).some((b) => b.shared)).toBe(false)
    expect(await runSync(A, api)).toBeNull()
  })
})
