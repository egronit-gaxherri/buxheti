import type { BudgetDB } from '../db/db'
import { keyOf, type RecordType, type RemoteRecord, type SyncConfig } from './types'

const rec = (type: RecordType, id: string, data: object): RemoteRecord => ({ type, id, data: data as Record<string, unknown>, deleted: false })

/**
 * Gjithçka që kjo pajisje ndan me familjen tani, si rekorde serveri.
 * Vetëm buxhetet `shared` dhe ato që lidhen me to; Personal, borxhet, limitet dhe fotot e faturave mbeten lokale.
 * Projeksioni duhet të jetë determinist: zbatimi i një rekordi të ardhur dhe projektimi sërish jep të njëjtin hash.
 */
export async function collectShared(db: BudgetDB, cfg: Pick<SyncConfig, 'memberName' | 'myPersonId'>): Promise<Map<string, RemoteRecord>> {
  const [budgets, categories, people, incomes] = await Promise.all([db.budgets.toArray(), db.categories.toArray(), db.people.toArray(), db.incomes.toArray()])
  const shared = new Set(budgets.filter((b) => b.shared).map((b) => b.id))
  const out = new Map<string, RemoteRecord>()
  const add = (r: RemoteRecord) => out.set(keyOf(r.type, r.id), r)
  if (shared.size === 0) return out

  const sharedList = [...shared]
  const [expenses, splits, transfers, adjustments, recurring, months] = await Promise.all([
    db.expenses.where('budgetId').anyOf(sharedList).toArray(),
    db.incomeSplits.where('budgetId').anyOf(sharedList).toArray(),
    db.transfers.toArray(),
    db.adjustments.where('budgetId').anyOf(sharedList).toArray(),
    db.recurring.toArray(),
    db.months.toArray(),
  ])

  for (const b of budgets) if (b.shared) add(rec('budget', b.id, { id: b.id, name: b.name, color: b.color, order: b.order, shared: true }))
  for (const c of categories) add(rec('category', c.id, c))
  for (const p of people) add(rec('person', p.id, p))
  for (const e of expenses) {
    const { receipt: _receipt, ...rest } = e // fotot nuk dërgohen
    add(rec('expense', e.id, { ...rest, addedBy: e.addedBy ?? cfg.memberName }))
  }
  const incomeById = new Map(incomes.map((i) => [i.id, i]))
  for (const s of splits) {
    const inc = incomeById.get(s.incomeId)
    if (!inc) continue
    add(rec('split', s.id, {
      ...s,
      date: inc.date,
      // të hyrat e "Unë" shkojnë te të tjerët me personin e anëtarit
      personId: inc.personId ?? cfg.myPersonId,
      source: inc.personId ? inc.source : cfg.memberName,
      note: inc.note,
      incomeCreatedAt: inc.createdAt,
    }))
  }
  for (const t of transfers) if (shared.has(t.fromBudgetId) || shared.has(t.toBudgetId)) add(rec('transfer', t.id, t))
  for (const a of adjustments) add(rec('adjustment', a.id, a))
  for (const r of recurring) if (shared.has(r.budgetId)) add(rec('recurring', r.id, r))
  for (const m of months)
    for (const [budgetId, amount] of Object.entries(m.carryIn ?? {}))
      if (shared.has(budgetId)) add(rec('carry', `${m.monthKey}:${budgetId}`, { monthKey: m.monthKey, budgetId, amount }))
  return out
}
