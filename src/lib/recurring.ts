import type { Recurring } from '../db/schema'
import { daysInMonth, monthKeyOf, shiftMonth, todayStr } from './dates'

const MAX_CATCHUP_MONTHS = 24

/**
 * Datat në të cilat shpenzimi i përsëritur duhet të ketë ndodhur por s'është shtuar ende.
 * Fillon nga muaji pas `lastRunMonth` (ose muaji aktual për shabllon të ri).
 * Dita 31 në muaj me 30 ditë bëhet dita e fundit e muajit.
 */
export function pendingDates(r: Recurring, today: string = todayStr()): string[] {
  const cur = monthKeyOf(today)
  let mk = r.lastRunMonth ? shiftMonth(r.lastRunMonth, 1) : cur
  const out: string[] = []
  for (let i = 0; mk <= cur && i < MAX_CATCHUP_MONTHS; i++, mk = shiftMonth(mk, 1)) {
    const day = Math.min(r.dayOfMonth, daysInMonth(mk))
    const date = `${mk}-${String(day).padStart(2, '0')}`
    if (date <= today) out.push(date)
  }
  return out
}
