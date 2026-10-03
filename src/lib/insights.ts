import type { Category, Expense, IncomeSplit, Recurring } from '../db/schema'
import { normalize } from './categorize'
import { daysInMonth, monthKeyOf, parseDate, shiftMonth, toDateStr } from './dates'
import { formatEUR } from './money'

export type Tone = 'warn' | 'good' | 'info'

export interface MakeRecurringAction {
  kind: 'make-recurring'
  description: string
  amount: number
  categoryId: string
  budgetId: string
  dayOfMonth: number
}

export interface Insight {
  /** I qëndrueshëm, që të mund të fshihet ("mos ma shfaq më"). */
  id: string
  tone: Tone
  icon: string
  title: string
  detail: string
  action?: MakeRecurringAction
}

export interface InsightInput {
  today: string
  /** Shpenzimet e të paktën 6 muajve të fundit (përfshi muajin aktual). */
  expenses: Expense[]
  incomeSplits: IncomeSplit[]
  categories: Category[]
  recurring: Recurring[]
}

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0)
const day = (date: string) => Number(date.slice(8, 10))
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
}

/**
 * Krahasimi me zakonin: shpenzimi i kategorisë deri sot vs mesatarja e 3 muajve të kaluar deri
 * në të njëjtën ditë. Shpenzimet e përsëritura (fikse) nuk llogariten.
 */
export function categoryAnomalies(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const d = day(inp.today)
  const variable = inp.expenses.filter((e) => !e.recurringId)
  const prevMonths = [1, 2, 3].map((n) => shiftMonth(cur, -n))
  const monthsWithData = prevMonths.filter((mk) => variable.some((e) => e.monthKey === mk))
  if (monthsWithData.length < 2) return []
  const name = (id: string) => inp.categories.find((c) => c.id === id)?.name ?? 'Tjetër'
  const out: Insight[] = []
  for (const c of new Set(variable.filter((e) => e.monthKey === cur || monthsWithData.includes(e.monthKey)).map((e) => e.categoryId))) {
    const now = sum(variable.filter((e) => e.monthKey === cur && e.categoryId === c && day(e.date) <= d))
    const avg = Math.round(
      monthsWithData.reduce((a, mk) => a + sum(variable.filter((e) => e.monthKey === mk && e.categoryId === c && day(e.date) <= Math.min(d, daysInMonth(mk)))), 0) / monthsWithData.length,
    )
    if (avg > 0 && now >= avg * 1.3 && now - avg >= 1000)
      out.push({
        id: `up:${c}:${cur}`, tone: 'warn', icon: '📈',
        title: `${name(c)}: ${pct(now, avg)}% më shumë se zakonisht`,
        detail: `Deri më ${d} të muajit ${formatEUR(now)}, zakonisht ${formatEUR(avg)} deri në këtë ditë.`,
      })
    else if (avg >= 2000 && d >= 10 && now <= avg * 0.6)
      out.push({
        id: `down:${c}:${cur}`, tone: 'good', icon: '📉',
        title: `${name(c)}: ${Math.abs(pct(now, avg))}% më pak se zakonisht`,
        detail: `${formatEUR(now)} deri më ${d} të muajit, kundrejt ${formatEUR(avg)} zakonisht.`,
      })
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warn' ? -1 : 1))
}

/**
 * Abonime të mundshme: i njëjti përshkrim në ≥3 nga 4 muajt e fundit, me shumë pothuajse të njëjtë (±10%),
 * që nuk është ende shpenzim i përsëritur.
 */
export function subscriptionCandidates(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const window = [0, 1, 2, 3].map((n) => shiftMonth(cur, -n))
  const known = new Set(inp.recurring.map((r) => normalize(r.description)))
  const groups = new Map<string, Expense[]>()
  for (const e of inp.expenses) {
    const k = normalize(e.description)
    if (!k || e.recurringId || known.has(k) || !window.includes(e.monthKey)) continue
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const out: Insight[] = []
  for (const [k, items] of groups) {
    const months = new Set(items.map((e) => e.monthKey))
    if (months.size < 3) continue
    // një pagesë për muaj, me shumë të qëndrueshme
    if (items.length > months.size + 1) continue
    const amounts = items.map((e) => e.amount)
    const m = median(amounts)
    if (amounts.some((a) => Math.abs(a - m) > m * 0.1)) continue
    const last = [...items].sort((a, b) => b.date.localeCompare(a.date))[0]
    out.push({
      id: `sub:${k}`, tone: 'info', icon: '🔁',
      title: `Duket si abonim: ${last.description} ${formatEUR(m)}/muaj`,
      detail: `U pagua në ${months.size} nga 4 muajt e fundit. E shton si shpenzim të përsëritur, që të llogaritet në parashikim?`,
      action: { kind: 'make-recurring', description: last.description, amount: m, categoryId: last.categoryId, budgetId: last.budgetId, dayOfMonth: median(items.map((e) => day(e.date))) },
    })
  }
  return out
}

/** Blerje të vogla e të shpeshta (p.sh. kafeja e përditshme), me koston e parashikuar vjetore. */
export function frequentSmall(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const d = day(inp.today)
  const groups = new Map<string, Expense[]>()
  for (const e of inp.expenses) {
    const k = normalize(e.description)
    if (k && e.monthKey === cur && !e.recurringId) groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const out: Insight[] = []
  for (const [k, items] of groups) {
    const total = sum(items)
    if (items.length < 6 || total / items.length > 600) continue
    out.push({
      id: `freq:${k}:${cur}`, tone: 'info', icon: '☕',
      title: `${items[0].description}: ${items.length} herë këtë muaj`,
      detail: `${formatEUR(total)} deri tani — rreth ${formatEUR(Math.round(((total / d) * 365) / 100) * 100)} në vit me këtë ritëm.`,
    })
  }
  return out
}

/** Përqindja e të hyrave që po kursehet këtë muaj, kundrejt muajit të kaluar. */
export function savingsRate(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const prev = shiftMonth(cur, -1)
  const rate = (mk: string) => {
    const income = sum(inp.incomeSplits.filter((s) => s.monthKey === mk))
    return income > 0 ? (income - sum(inp.expenses.filter((e) => e.monthKey === mk))) / income : null
  }
  const r = rate(cur)
  if (r === null) return []
  const p = rate(prev)
  const rp = Math.round(r * 100)
  const cmp = p === null ? '' : ` (muajin e kaluar ${Math.round(p * 100)}%)`
  if (r < 0) return [{ id: `rate:${cur}`, tone: 'warn', icon: '⚠️', title: 'Po shpenzon më shumë se sa ke të hyra këtë muaj', detail: `Shpenzimet kalojnë të hyrat me ${Math.abs(rp)}%${cmp}.` }]
  return [{ id: `rate:${cur}`, tone: p !== null && r < p ? 'info' : 'good', icon: '🐷', title: `Po kursen ${rp}% të të hyrave`, detail: `Kjo është pjesa e të hyrave të muajit që nuk është shpenzuar ende${cmp}.` }]
}

/** Ditët pa asnjë shpenzim këtë muaj (deri dje, pa ato të përsëritura). */
export function noSpendDays(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const d = day(inp.today)
  if (d < 4) return []
  const spent = new Set(inp.expenses.filter((e) => e.monthKey === cur && !e.recurringId).map((e) => day(e.date)))
  let free = 0
  for (let i = 1; i < d; i++) if (!spent.has(i)) free++
  if (free < 3) return []
  return [{ id: `nospend:${cur}`, tone: 'good', icon: '👏', title: `${free} ditë pa asnjë shpenzim këtë muaj`, detail: `Nga ${d - 1} ditët e kaluara të muajit.` }]
}

/** Kategoria që merr pjesën më të madhe (≥40%) të shpenzimeve të muajit. */
export function topCategory(inp: InsightInput): Insight[] {
  const cur = monthKeyOf(inp.today)
  const items = inp.expenses.filter((e) => e.monthKey === cur)
  const total = sum(items)
  if (total < 5000) return []
  const by = new Map<string, number>()
  for (const e of items) by.set(e.categoryId, (by.get(e.categoryId) ?? 0) + e.amount)
  const [cat, amount] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
  const share = Math.round((amount / total) * 100)
  if (share < 40) return []
  const name = inp.categories.find((c) => c.id === cat)?.name ?? 'Tjetër'
  return [{ id: `top:${cat}:${cur}`, tone: 'info', icon: '🥧', title: `${name} merr ${share}% të shpenzimeve`, detail: `${formatEUR(amount)} nga ${formatEUR(total)} këtë muaj.` }]
}

const ORDER: Record<Tone, number> = { warn: 0, info: 1, good: 2 }

/** Të gjitha vëzhgimet, më të rëndësishmet së pari, pa ato që përdoruesi i ka fshehur. */
export function computeInsights(inp: InsightInput, dismissed: string[] = [], limit = 8): Insight[] {
  const all = [
    ...categoryAnomalies(inp), ...subscriptionCandidates(inp), ...savingsRate(inp),
    ...frequentSmall(inp), ...topCategory(inp), ...noSpendDays(inp),
  ]
  return all
    .filter((i) => !dismissed.includes(i.id))
    .sort((a, b) => ORDER[a.tone] - ORDER[b.tone] || Number(!!b.action) - Number(!!a.action))
    .slice(0, limit)
}

export interface WeekSummary {
  from: string
  total: number
  previous: number
  deltaPct: number | null
  count: number
  topCategoryId?: string
  topAmount: number
}

/** 7 ditët e fundit (përfshi sot) kundrejt 7 ditëve para tyre. */
export function weekSummary(expenses: Expense[], today: string): WeekSummary {
  const t = parseDate(today).getTime()
  const from = toDateStr(new Date(t - 6 * 86_400_000))
  const prevFrom = toDateStr(new Date(t - 13 * 86_400_000))
  const week = expenses.filter((e) => e.date >= from && e.date <= today)
  const prevWeek = expenses.filter((e) => e.date >= prevFrom && e.date < from)
  const by = new Map<string, number>()
  for (const e of week) by.set(e.categoryId, (by.get(e.categoryId) ?? 0) + e.amount)
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
  const total = sum(week)
  const previous = sum(prevWeek)
  return { from, total, previous, deltaPct: previous > 0 ? pct(total, previous) : null, count: week.length, topCategoryId: top?.[0], topAmount: top?.[1] ?? 0 }
}
