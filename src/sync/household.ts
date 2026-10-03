import type { BudgetDB } from '../db/db'
import { newId, PERSON_COLORS } from '../db/db'
import type { Budget, Category, Person } from '../db/schema'
import { normalize } from '../lib/categorize'
import { syncOnce, type SyncResult } from './engine'
import { mergeIntoHousehold } from './merge'
import { rpc, SupabaseRemote, type HouseholdIdentity } from './remote'
import type { RemoteRecord, SyncConfig, SyncRemote } from './types'

export const SYNC_KEY = 'sync'

/** Ndërfaqja me serverin; në teste zëvendësohet me një server në memorie. */
export interface HouseholdApi {
  create(name: string, memberName: string): Promise<HouseholdIdentity>
  join(code: string, memberName: string): Promise<HouseholdIdentity>
  leave(token: string, memberId: string): Promise<void>
  remote(token: string): SyncRemote
}

export const supabaseApi: HouseholdApi = {
  create: (name, memberName) => rpc('create_household', { p_name: name, p_display_name: memberName }),
  join: (code, memberName) => rpc('join_household', { p_code: code, p_display_name: memberName }),
  leave: (token, memberId) => rpc('remove_member', { p_token: token, p_member_id: memberId }),
  remote: (token) => new SupabaseRemote(token),
}

export const getSyncConfig = async (db: BudgetDB) => (await db.settings.get(SYNC_KEY))?.value as SyncConfig | undefined
export const saveSyncConfig = (db: BudgetDB, cfg: SyncConfig) => db.settings.put({ key: SYNC_KEY, value: cfg })

/** Personi që përfaqëson këtë anëtar; lidhet me një person ekzistues me të njëjtin emër nëse ka. */
async function ensureMemberPerson(db: BudgetDB, memberId: string, memberName: string): Promise<string> {
  const people = await db.people.toArray()
  const mine = people.find((p) => p.memberId === memberId) ?? people.find((p) => !p.memberId && normalize(p.name) === normalize(memberName))
  if (mine) {
    await db.people.update(mine.id, { memberId, archived: false })
    return mine.id
  }
  const p: Person = { id: newId(), name: memberName.trim(), color: PERSON_COLORS[people.length % PERSON_COLORS.length], archived: false, createdAt: Date.now(), memberId }
  await db.people.add(p)
  return p.id
}

function toConfig(id: HouseholdIdentity, memberName: string, role: SyncConfig['role'], myPersonId: string): SyncConfig {
  return {
    householdId: id.household_id, householdName: id.household_name, joinCode: id.join_code, memberId: id.member_id,
    memberName: memberName.trim(), token: id.member_token, role, myPersonId, cursor: null,
  }
}

/** Krijon familjen dhe ndan buxhetet e zgjedhura (zakonisht Shtëpi). */
export async function createHousehold(db: BudgetDB, api: HouseholdApi, p: { householdName: string; memberName: string; sharedBudgetIds: string[] }): Promise<SyncConfig> {
  if (!p.memberName.trim()) throw new Error('Shkruaj emrin tënd')
  if (p.sharedBudgetIds.length === 0) throw new Error('Zgjidh të paktën një buxhet për ta ndarë')
  const id = await api.create(p.householdName.trim() || 'Familja', p.memberName)
  await db.transaction('rw', db.budgets, db.syncState, async () => {
    await db.syncState.clear()
    for (const b of await db.budgets.toArray()) await db.budgets.update(b.id, { shared: p.sharedBudgetIds.includes(b.id) })
  })
  const cfg = toConfig(id, p.memberName, 'owner', await ensureMemberPerson(db, id.member_id, p.memberName))
  await saveSyncConfig(db, cfg)
  await runSync(db, api)
  return cfg
}

/**
 * Bashkohet me kod: shkarkon buxhetet/kategoritë/personat e familjes, lidh ato lokale me të njëjtin emër
 * (p.sh. "Shtëpi" e këtij telefoni bëhet "Shtëpi" e familjes), pastaj sinkronizon.
 */
export async function joinHousehold(db: BudgetDB, api: HouseholdApi, p: { code: string; memberName: string }): Promise<SyncConfig> {
  if (!p.memberName.trim()) throw new Error('Shkruaj emrin tënd')
  const id = await api.join(p.code, p.memberName)
  const remote = api.remote(id.member_token)
  const all: RemoteRecord[] = []
  for (let after = null as Parameters<SyncRemote['pull']>[0]; ; ) {
    const page = await remote.pull(after, 1000)
    all.push(...page)
    if (page.length < 1000) break
    const last = page[page.length - 1]
    after = { ts: last.updated_at!, type: last.type, id: last.id }
  }
  const live = (t: string) => all.filter((r) => r.type === t && !r.deleted).map((r) => r.data)
  await db.syncState.clear()
  await mergeIntoHousehold(db, { budgets: live('budget') as unknown as Budget[], categories: live('category') as unknown as Category[], people: live('person') as unknown as Person[] })
  const cfg = toConfig(id, p.memberName, 'member', await ensureMemberPerson(db, id.member_id, p.memberName))
  await saveSyncConfig(db, cfg)
  await runSync(db, api)
  return cfg
}

/** Largohet nga familja. Të dhënat lokale mbeten; thjesht ndalon sinkronizimi. */
export async function leaveHousehold(db: BudgetDB, api: HouseholdApi): Promise<void> {
  const cfg = await getSyncConfig(db)
  if (cfg) await api.leave(cfg.token, cfg.memberId).catch(() => undefined) // edhe nëse serveri s'arrihet
  await db.transaction('rw', db.settings, db.syncState, db.budgets, async () => {
    await db.settings.delete(SYNC_KEY)
    await db.syncState.clear()
    await db.budgets.toCollection().modify((b: Budget) => void (b.shared = false))
  })
}

/** Një cikël sinkronizimi me konfigurimin e ruajtur; përditëson kursorin. */
export async function runSync(db: BudgetDB, api: HouseholdApi): Promise<SyncResult | null> {
  const cfg = await getSyncConfig(db)
  if (!cfg) return null
  const res = await syncOnce(db, api.remote(cfg.token), cfg)
  const now = await getSyncConfig(db)
  if (now?.memberId === cfg.memberId) await saveSyncConfig(db, { ...now, cursor: res.cursor, lastSyncAt: Date.now() })
  return res
}
