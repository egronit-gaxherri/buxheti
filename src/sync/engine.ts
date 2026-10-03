import type { BudgetDB } from '../db/db'
import type { Adjustment, Budget, Category, Expense, Income, IncomeSplit, Person, Recurring, Transfer } from '../db/schema'
import { collectShared } from './project'
import { recordHash } from './hash'
import { keyOf, type Cursor, type RemoteRecord, type SyncConfig, type SyncRemote } from './types'

const PUSH_BATCH = 400
const PULL_PAGE = 500
/** Shkarkimi rifillon pak para kursorit, që të mos humbasë rekorde të konfirmuara me vonesë. */
const PULL_OVERLAP_MS = 10_000

export interface SyncResult {
  pushed: number
  pulled: number
  cursor: Cursor | null
}

/** Rekordet lokale që kanë ndryshuar që nga sinkronizimi i fundit (përfshi fshirjet si gurë varri). */
export async function localChanges(db: BudgetDB, cfg: SyncConfig): Promise<RemoteRecord[]> {
  const [local, state] = await Promise.all([collectShared(db, cfg), db.syncState.toArray()])
  const known = new Map(state.map((s) => [s.key, s.hash]))
  const changes: RemoteRecord[] = []
  for (const [key, r] of local) if (known.get(key) !== recordHash(r)) changes.push(r)
  for (const key of known.keys()) {
    if (local.has(key)) continue
    const i = key.indexOf(':')
    changes.push({ type: key.slice(0, i) as RemoteRecord['type'], id: key.slice(i + 1), data: null, deleted: true })
  }
  return changes
}

/** Një cikël i plotë: ngarko ndryshimet lokale, pastaj shkarko dhe zbato ato të të tjerëve. */
export async function syncOnce(db: BudgetDB, remote: SyncRemote, cfg: SyncConfig): Promise<SyncResult> {
  // 1) Ngarko
  const changes = await localChanges(db, cfg)
  for (let i = 0; i < changes.length; i += PUSH_BATCH) {
    const batch = changes.slice(i, i + PUSH_BATCH)
    await remote.push(batch)
    await db.transaction('rw', db.syncState, async () => {
      for (const r of batch) {
        if (r.deleted) await db.syncState.delete(keyOf(r.type, r.id))
        else await db.syncState.put({ key: keyOf(r.type, r.id), hash: recordHash(r) })
      }
    })
  }

  // 2) Shkarko
  let after: Cursor | null = cfg.cursor
    ? { ts: new Date(new Date(cfg.cursor.ts).getTime() - PULL_OVERLAP_MS).toISOString(), type: '', id: '' }
    : null
  let cursor = cfg.cursor
  let pulled = 0
  for (;;) {
    const page = await remote.pull(after, PULL_PAGE)
    if (page.length === 0) break
    pulled += await applyRemote(db, page, cfg)
    const last = page[page.length - 1]
    after = { ts: last.updated_at!, type: last.type, id: last.id }
    if (!cursor || after.ts > cursor.ts || (after.ts === cursor.ts && `${after.type}:${after.id}` > `${cursor.type}:${cursor.id}`)) cursor = after
    if (page.length < PULL_PAGE) break
  }
  return { pushed: changes.length, pulled, cursor }
}

/**
 * Zbaton rekordet e ardhura. Rregulli i konfliktit: nëse rekordi lokal ka ndryshuar dhe s'është ngarkuar
 * ende, fiton ai lokal (do të ngarkohet në ciklin tjetër) — "i fundit që ngarkon fiton".
 * Kthen sa rekorde u zbatuan realisht.
 */
export async function applyRemote(db: BudgetDB, records: RemoteRecord[], cfg: SyncConfig): Promise<number> {
  const tables = [db.budgets, db.categories, db.people, db.expenses, db.incomes, db.incomeSplits, db.transfers, db.adjustments, db.recurring, db.months, db.syncState]
  return db.transaction('rw', tables, async () => {
    const local = await collectShared(db, cfg)
    const state = new Map((await db.syncState.toArray()).map((s) => [s.key, s.hash]))
    let applied = 0
    for (const r of records) {
      const key = keyOf(r.type, r.id)
      const h = recordHash(r)
      if (state.get(key) === h) continue // jehona e ngarkimit tonë
      const mine = local.get(key)
      if (r.deleted && !mine && !state.has(key)) continue // e fshirë tashmë këtu (rimarrje nga mbivendosja)
      const dirty = mine ? recordHash(mine) !== state.get(key) : state.has(key) // ndryshuar ose fshirë lokalisht
      if (dirty && !(mine && recordHash(mine) === h)) continue
      await applyOne(db, r)
      if (r.deleted) await db.syncState.delete(key)
      else await db.syncState.put({ key, hash: h })
      applied++
    }
    return applied
  })
}

async function applyOne(db: BudgetDB, r: RemoteRecord): Promise<void> {
  const d = r.data as never
  switch (r.type) {
    case 'budget': {
      if (r.deleted) return void (await db.budgets.update(r.id, { shared: false }))
      const b = d as Budget
      await db.budgets.put({ id: r.id, name: b.name, color: b.color, order: b.order, shared: true })
      return
    }
    case 'category':
      if (!r.deleted) await db.categories.put(d as Category)
      return
    case 'person': {
      if (!r.deleted) return void (await db.people.put(d as Person))
      // personi me histori lokale vetëm arkivohet
      if ((await db.incomes.where('personId').equals(r.id).count()) > 0) await db.people.update(r.id, { archived: true })
      else await db.people.delete(r.id)
      return
    }
    case 'expense': {
      if (r.deleted) return void (await db.expenses.delete(r.id))
      const prev = await db.expenses.get(r.id)
      await db.expenses.put({ ...(d as Expense), receipt: prev?.receipt }) // ruaj foton lokale
      return
    }
    case 'split':
      return applySplit(db, r)
    case 'transfer':
      return void (r.deleted ? await db.transfers.delete(r.id) : await db.transfers.put(d as Transfer))
    case 'adjustment':
      return void (r.deleted ? await db.adjustments.delete(r.id) : await db.adjustments.put(d as Adjustment))
    case 'recurring':
      return void (r.deleted ? await db.recurring.delete(r.id) : await db.recurring.put(d as Recurring))
    case 'carry': {
      const [monthKey, budgetId] = r.id.split(':')
      const m = (await db.months.get(monthKey)) ?? { monthKey, closed: false, carryIn: {} }
      const carryIn = { ...m.carryIn }
      if (r.deleted) delete carryIn[budgetId]
      else carryIn[budgetId] = (d as { amount: number }).amount
      await db.months.put({ ...m, carryIn })
      return
    }
  }
}

/** Ndarja e një të hyre nga një anëtar tjetër: ruhet ndarja + një "e hyrë hije" për emrin, datën, personin. */
async function applySplit(db: BudgetDB, r: RemoteRecord): Promise<void> {
  const existing = r.deleted ? await db.incomeSplits.get(r.id) : undefined
  const incomeId = r.deleted ? existing?.incomeId : (r.data as { incomeId: string }).incomeId
  if (r.deleted) await db.incomeSplits.delete(r.id)
  else {
    const s = r.data as unknown as IncomeSplit & { date: string; personId: string; source: string; note?: string; incomeCreatedAt: number }
    await db.incomeSplits.put({ id: s.id, incomeId: s.incomeId, budgetId: s.budgetId, monthKey: s.monthKey, amount: s.amount })
    const inc = await db.incomes.get(s.incomeId)
    if (!inc || inc.shadow) {
      const shadow: Income = {
        id: s.incomeId, monthKey: s.monthKey, personId: s.personId, source: s.source, note: s.note,
        amount: 0, date: s.date, createdAt: s.incomeCreatedAt, shadow: true,
      }
      await db.incomes.put(shadow)
    }
  }
  if (!incomeId) return
  const inc = await db.incomes.get(incomeId)
  if (!inc?.shadow) return // e hyra jonë e vërtetë nuk preket
  const rest = await db.incomeSplits.where('incomeId').equals(incomeId).toArray()
  if (rest.length === 0) await db.incomes.delete(incomeId)
  else await db.incomes.update(incomeId, { amount: rest.reduce((a, x) => a + x.amount, 0) })
}
