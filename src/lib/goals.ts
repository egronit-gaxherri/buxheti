import type { Goal } from '../db/schema'
import { monthKeyOf, shiftMonth } from './dates'

export const savedOf = (g: Goal) => g.contributions.reduce((a, c) => a + c.amount, 0)
export const leftOf = (g: Goal) => Math.max(0, g.target - savedOf(g))

const monthIndex = (mk: string) => Number(mk.slice(0, 4)) * 12 + Number(mk.slice(5, 7)) - 1

/** Muajt që mbeten deri në afat, duke numëruar edhe muajin aktual (min 1). */
export function monthsLeft(deadline: string, today: string): number {
  return Math.max(1, monthIndex(monthKeyOf(deadline)) - monthIndex(monthKeyOf(today)) + 1)
}

/**
 * Ritmi mesatar mujor i kursimit në 6 muajt e fundit (përfshi muajt pa kursim, që nga i pari me kursim).
 * Muaji aktual llogaritet vetëm nëse ka kursim, që të mos e ulë ritmin në fillim të muajit.
 */
export function monthlyPace(g: Goal, today: string): number {
  if (g.contributions.length === 0) return 0
  const cur = monthKeyOf(today)
  const first = g.contributions.map((c) => monthKeyOf(c.date)).sort()[0]
  const byMonth = new Map<string, number>()
  for (const c of g.contributions) byMonth.set(monthKeyOf(c.date), (byMonth.get(monthKeyOf(c.date)) ?? 0) + c.amount)
  const months: string[] = []
  for (let mk = cur, i = 0; i < 6 && mk >= first; i++, mk = shiftMonth(mk, -1)) {
    if (mk === cur && !byMonth.has(cur)) continue
    months.push(mk)
  }
  if (months.length === 0) return 0
  return Math.max(0, Math.round(months.reduce((a, mk) => a + (byMonth.get(mk) ?? 0), 0) / months.length))
}

export type GoalStatus = 'achieved' | 'overdue' | 'on-track' | 'behind' | 'not-started' | 'open'

export interface GoalProgress {
  saved: number
  left: number
  pct: number
  status: GoalStatus
  /** Sa duhet kursyer në muaj për ta arritur në afat. */
  perMonth?: number
  monthsLeft?: number
  pace: number
  /** Muaji i parashikuar kur arrihet me ritmin aktual. */
  projectedMonth?: string
}

export function goalProgress(g: Goal, today: string): GoalProgress {
  const saved = savedOf(g)
  const left = leftOf(g)
  const pct = g.target > 0 ? Math.min(1, saved / g.target) : 0
  const pace = monthlyPace(g, today)
  const projectedMonth = left > 0 && pace > 0 ? shiftMonth(monthKeyOf(today), Math.ceil(left / pace) - (g.contributions.some((c) => monthKeyOf(c.date) === monthKeyOf(today)) ? 0 : 1)) : undefined
  const base = { saved, left, pct, pace, projectedMonth }
  if (left === 0) return { ...base, status: 'achieved' }
  if (!g.deadline) return { ...base, status: saved > 0 ? 'open' : 'not-started' }
  if (g.deadline < today) return { ...base, status: 'overdue' }
  // nëse ky muaj ka pasur tashmë kursim, mbetja ndahet në muajt pasardhës deri në afat
  const hasCurrent = g.contributions.some((c) => c.amount > 0 && monthKeyOf(c.date) === monthKeyOf(today))
  const all = monthsLeft(g.deadline, today)
  const ml = hasCurrent && all > 1 ? all - 1 : all
  const perMonth = Math.ceil(left / ml)
  const status: GoalStatus = saved === 0 && pace === 0 ? 'not-started' : projectedMonth && projectedMonth <= monthKeyOf(g.deadline) ? 'on-track' : 'behind'
  return { ...base, status, perMonth, monthsLeft: ml }
}

export const GOAL_ICONS = ['🎯', '🏖️', '🚗', '🏠', '💍', '🎓', '📱', '🛋️', '🆘', '🎁', '✈️', '👶']
