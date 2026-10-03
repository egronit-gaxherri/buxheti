import type { BudgetDB } from '../db/db'
import type { Budget, Category, Person } from '../db/schema'
import { normalize } from '../lib/categorize'

type IdMap = Record<string, string>

/**
 * Zëvendëson id-të lokale me ato të familjes në të gjitha referencat, pastaj fshin rreshtat e vjetër.
 * Përdoret kur një pajisje bashkohet: "Shtëpi", "Ushqim", "Edi" lokale = ato të familjes.
 */
export async function remapIds(db: BudgetDB, maps: { budget?: IdMap; category?: IdMap; person?: IdMap }): Promise<void> {
  const B = maps.budget ?? {}
  const C = maps.category ?? {}
  const P = maps.person ?? {}
  const b = (id?: string) => (id && B[id]) || id
  const tables = [db.budgets, db.categories, db.people, db.expenses, db.incomes, db.incomeSplits, db.transfers, db.adjustments, db.recurring, db.debts, db.months, db.limits, db.descriptions]
  await db.transaction('rw', tables, async () => {
    if (Object.keys(B).length) {
      const olds = Object.keys(B)
      await db.expenses.where('budgetId').anyOf(olds).modify((e) => void (e.budgetId = B[e.budgetId]))
      await db.incomeSplits.where('budgetId').anyOf(olds).modify((s) => void (s.budgetId = B[s.budgetId]))
      await db.adjustments.where('budgetId').anyOf(olds).modify((a) => void (a.budgetId = B[a.budgetId]))
      await db.transfers.toCollection().modify((t) => {
        t.fromBudgetId = b(t.fromBudgetId)!
        t.toBudgetId = b(t.toBudgetId)!
      })
      await db.recurring.toCollection().modify((r) => void (r.budgetId = b(r.budgetId)!))
      await db.debts.toCollection().modify((d) => {
        d.budgetId = b(d.budgetId)
        d.payments = d.payments.map((p) => ({ ...p, budgetId: b(p.budgetId) }))
      })
      const rekey = (o?: Record<string, number>) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [b(k)!, v]))
      await db.months.toCollection().modify((m) => {
        m.carryIn = rekey(m.carryIn) ?? {}
        m.carried = rekey(m.carried)
      })
      await db.descriptions.toCollection().modify((x) => void (x.lastBudgetId = b(x.lastBudgetId)!))
      await db.budgets.bulkDelete(olds.filter((id) => B[id] !== id))
    }
    if (Object.keys(C).length) {
      const olds = Object.keys(C)
      await db.expenses.where('categoryId').anyOf(olds).modify((e) => void (e.categoryId = C[e.categoryId]))
      await db.recurring.toCollection().modify((r) => void (r.categoryId = C[r.categoryId] ?? r.categoryId))
      await db.descriptions.toCollection().modify((x) => void (x.lastCategoryId = C[x.lastCategoryId] ?? x.lastCategoryId))
      for (const l of await db.limits.where('categoryId').anyOf(olds).toArray()) {
        await db.limits.delete(l.id)
        await db.limits.put({ ...l, id: C[l.categoryId], categoryId: C[l.categoryId] })
      }
      await db.categories.bulkDelete(olds.filter((id) => C[id] !== id))
    }
    if (Object.keys(P).length) {
      const olds = Object.keys(P)
      await db.incomes.where('personId').anyOf(olds).modify((i) => void (i.personId = P[i.personId!]))
      await db.debts.where('personId').anyOf(olds).modify((d) => void (d.personId = P[d.personId!]))
      await db.people.bulkDelete(olds.filter((id) => P[id] !== id))
    }
  })
}

/** Lidh rreshtat lokalë me ata të familjes sipas emrit (pa shkronja të mëdha/theks). */
export function matchByName<T extends { id: string; name: string }>(local: T[], remote: T[]): IdMap {
  const byName = new Map(remote.map((r) => [normalize(r.name), r.id]))
  const map: IdMap = {}
  for (const l of local) {
    const id = byName.get(normalize(l.name))
    if (id && id !== l.id) map[l.id] = id
  }
  return map
}

/**
 * Përgatit bazën lokale për t'u bashkuar me familjen: fut buxhetet/kategoritë/personat e familjes
 * dhe ribën referencat lokale drejt tyre. Buxhetet lokale me të njëjtin emër me një të përbashkët bëhen ai.
 */
export async function mergeIntoHousehold(
  db: BudgetDB,
  remote: { budgets: Budget[]; categories: Category[]; people: Person[] },
): Promise<void> {
  const [lb, lc, lp] = await Promise.all([db.budgets.toArray(), db.categories.toArray(), db.people.toArray()])
  const budgetMap = matchByName(lb, remote.budgets)
  const categoryMap = matchByName(lc, remote.categories)
  const personMap = matchByName(lp, remote.people)
  const maxOrder = Math.max(-1, ...lb.map((x) => x.order))
  await db.transaction('rw', db.budgets, db.categories, db.people, async () => {
    let extra = 0
    for (const rb of remote.budgets) {
      const replaces = lb.find((x) => budgetMap[x.id] === rb.id)
      const existing = lb.find((x) => x.id === rb.id)
      // ruaj renditjen lokale të buxhetit që zëvendësohet; të rinjtë shkojnë në fund
      const order = replaces?.order ?? existing?.order ?? maxOrder + 1 + extra++
      await db.budgets.put({ ...rb, order, shared: true })
    }
    await db.categories.bulkPut(remote.categories)
    await db.people.bulkPut(remote.people)
  })
  await remapIds(db, { budget: budgetMap, category: categoryMap, person: personMap })
}
