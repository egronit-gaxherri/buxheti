import type { Income, IncomeSplit } from '../db/schema'

/** Çelësi i "vetë përdoruesit" (të hyra pa person, p.sh. rroga). */
export const ME = 'me'
/** `meId` = personi që përfaqëson këtë anëtar në familje — trajtohet si "Unë". */
export const personKey = (i: Pick<Income, 'personId'>, meId?: string) => (i.personId && i.personId !== meId ? i.personId : ME)

export interface Contribution {
  key: string // personId ose ME
  total: number
  count: number
  /** budgetId → cent */
  byBudget: Record<string, number>
}

/** Mbledh të hyrat sipas personit, me ndarjen sipas buxhetit. Më e madhja së pari. */
export function contributionsByPerson(incomes: Income[], splits: IncomeSplit[], meId?: string): Contribution[] {
  const map = new Map<string, Contribution>()
  const keyOf = new Map(incomes.map((i) => [i.id, personKey(i, meId)]))
  for (const i of incomes) {
    const k = personKey(i, meId)
    const c = map.get(k) ?? { key: k, total: 0, count: 0, byBudget: {} }
    c.total += i.amount
    c.count += 1
    map.set(c.key, c)
  }
  for (const s of splits) {
    const c = map.get(keyOf.get(s.incomeId) ?? '')
    if (c) c.byBudget[s.budgetId] = (c.byBudget[s.budgetId] ?? 0) + s.amount
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export type Destination = { kind: 'budget'; budgetId: string } | { kind: 'split'; percents: Record<string, string> }

/**
 * Ku shkuan paratë herën e fundit që dha ky person — për ta parazgjedhur.
 * Një ndarje e vetme → ai buxhet; disa → përqindjet (2 decimale, që mbledhin 100).
 */
export function lastDestination(key: string, incomes: Income[], splits: IncomeSplit[], meId?: string): Destination | null {
  const last = incomes
    .filter((i) => personKey(i, meId) === key)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]
  if (!last) return null
  const parts = splits.filter((s) => s.incomeId === last.id && s.amount > 0)
  if (parts.length === 0) return null
  if (parts.length === 1) return { kind: 'budget', budgetId: parts[0].budgetId }
  const percents: Record<string, string> = {}
  let used = 0
  parts.forEach((p, idx) => {
    const v = idx === parts.length - 1 ? Math.round((100 - used) * 100) / 100 : Math.round((p.amount / last.amount) * 10000) / 100
    used += v
    percents[p.budgetId] = String(v)
  })
  return { kind: 'split', percents }
}
