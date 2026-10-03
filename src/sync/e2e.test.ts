/**
 * Test kundër serverit të vërtetë Supabase. Ekzekutohet vetëm me SUPABASE_E2E=1:
 *   SUPABASE_E2E=1 npx vitest run src/sync/e2e.test.ts
 */
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { BudgetDB } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { loadMonthData } from '../db/queries'
import { summarizeBudget } from '../lib/calc'
import { createHousehold, getSyncConfig, joinHousehold, leaveHousehold, runSync, supabaseApi } from './household'
import { localChanges } from './engine'
import { rpc, type HouseholdInfo } from './remote'

describe.skipIf(!process.env.SUPABASE_E2E)('Supabase e2e', () => {
  it('dy pajisje sinkronizojnë Shtëpinë përmes serverit', async () => {
    await Promise.all(['e2e-a', 'e2e-b'].map((n) => Dexie.delete(n)))
    const A = new BudgetDB('e2e-a')
    const B = new BudgetDB('e2e-b')
    await seedIfEmpty(A)
    await seedIfEmpty(B)
    const [homeA, personalA] = await A.budgets.orderBy('order').toArray()
    const cat = (await A.categories.toArray())[0]
    await A.expenses.add({ id: crypto.randomUUID(), monthKey: '2026-10', budgetId: homeA.id, categoryId: cat.id, amount: 1250, description: 'Bukë', date: '2026-10-02', createdAt: 1 })
    await A.expenses.add({ id: crypto.randomUUID(), monthKey: '2026-10', budgetId: personalA.id, categoryId: cat.id, amount: 999, description: 'Sekret', date: '2026-10-02', createdAt: 2 })

    const cfgA = await createHousehold(A, supabaseApi, { householdName: 'E2E test', memberName: 'Egronit', sharedBudgetIds: [homeA.id] })
    const cfgB = await joinHousehold(B, supabaseApi, { code: cfgA.joinCode.slice(0, 5) + '-' + cfgA.joinCode.slice(5), memberName: 'Arta' })

    const info = await rpc<HouseholdInfo>('household_info', { p_token: cfgB.token })
    expect(info.members.map((m) => `${m.display_name}:${m.role}`)).toEqual(['Egronit:owner', 'Arta:member'])

    // B shton një shpenzim në Shtëpi; A e merr
    const homeB = (await B.budgets.toArray()).find((b) => b.shared)!
    expect(homeB.id).toBe(homeA.id)
    await B.expenses.add({ id: crypto.randomUUID(), monthKey: '2026-10', budgetId: homeB.id, categoryId: cat.id, amount: 300, description: 'Qumësht', date: '2026-10-03', createdAt: 3 })
    for (let i = 0; i < 2; i++) {
      await runSync(B, supabaseApi)
      await runSync(A, supabaseApi)
    }
    const rem = async (d: BudgetDB) => summarizeBudget(await loadMonthData('2026-10', d), homeA.id, '2026-10-03').remaining
    expect(await rem(A)).toBe(-1550)
    expect(await rem(B)).toBe(-1550)
    expect((await B.expenses.toArray()).some((e) => e.description === 'Sekret')).toBe(false)
    expect((await A.expenses.toArray()).find((e) => e.description === 'Qumësht')?.addedBy).toBe('Arta')
    expect(await localChanges(A, (await getSyncConfig(A))!)).toEqual([])
    expect(await localChanges(B, (await getSyncConfig(B))!)).toEqual([])

    // Largimi: tokeni i B nuk vlen më
    await leaveHousehold(B, supabaseApi)
    await expect(rpc('household_info', { p_token: cfgB.token })).rejects.toThrow('nuk është më anëtare')
    await leaveHousehold(A, supabaseApi)
    A.close()
    B.close()
  }, 60_000)
})
