export const MONTH_NAMES = [
  'Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor',
  'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor',
]
const WEEKDAYS = ['E diel', 'E hënë', 'E martë', 'E mërkurë', 'E enjte', 'E premte', 'E shtunë']

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => toDateStr(new Date())
export const monthKeyOf = (date: string) => date.slice(0, 7)
export const currentMonthKey = () => monthKeyOf(todayStr())

export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "2026-10-02" → "02.10.2026" */
export function formatDateSQ(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}

export function formatMonthSQ(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export function weekdaySQ(date: string): string {
  return WEEKDAYS[parseDate(date).getDay()]
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Ditët e mbetura në muaj, përfshirë ditën e sotme.
 * Për muaj të kaluar → 0; për muaj të ardhshëm → të gjitha ditët.
 */
export function daysRemaining(monthKey: string, today: string = todayStr()): number {
  const total = daysInMonth(monthKey)
  const cur = monthKeyOf(today)
  if (monthKey < cur) return 0
  if (monthKey > cur) return total
  return total - Number(today.slice(8, 10)) + 1
}
