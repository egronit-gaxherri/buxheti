import type { Budget, Category, Income } from '../db/schema'
import type { MonthData } from './calc'
import { formatDateSQ } from './dates'

/** 12,50 / -12,50 — pa €, pa ndarës mijëshesh, që Excel/Numbers ta lexojnë si numër. */
const num = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`

/** Tekst i sigurt për CSV: thonjëza kur duhet + mbrojtje nga "formula injection" (=, +, -, @). */
function text(s: string): string {
  let v = s.replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * CSV i muajit: të hyrat (sipas ndarjes), shpenzimet, transferimet, korrigjimet.
 * Ndarës ";" dhe presje dhjetore, me BOM — hapet drejt në Excel me gjuhë evropiane.
 */
export function monthCsv(d: MonthData, incomes: Income[], budgets: Budget[], categories: Category[]): string {
  const bud = (id: string) => budgets.find((b) => b.id === id)?.name ?? '?'
  const cat = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  type Row = { date: string; order: number; cells: string[] }
  const rows: Row[] = []

  for (const s of d.incomeSplits) {
    const inc = incomes.find((i) => i.id === s.incomeId)
    rows.push({ date: inc?.date ?? `${d.monthKey}-01`, order: 0, cells: ['Të hyra', text(bud(s.budgetId)), '', text(inc?.source ?? ''), num(s.amount), ''] })
  }
  for (const e of d.expenses)
    rows.push({ date: e.date, order: 1, cells: ['Shpenzim', text(bud(e.budgetId)), text(cat(e.categoryId)), text(e.description), num(-e.amount), text(e.note ?? '')] })
  for (const t of d.transfers)
    rows.push({ date: t.date, order: 2, cells: ['Transferim', text(`${bud(t.fromBudgetId)} → ${bud(t.toBudgetId)}`), '', '', num(t.amount), text(t.note ?? '')] })
  for (const a of d.adjustments)
    rows.push({ date: a.date, order: 3, cells: ['Korrigjim', text(bud(a.budgetId)), '', '', num(a.amount), text(a.note ?? '')] })

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  const header = ['Data', 'Lloji', 'Buxheti', 'Kategoria', 'Përshkrimi', 'Shuma (€)', 'Shënim']
  return '﻿' + [header.join(';'), ...rows.map((r) => [formatDateSQ(r.date), ...r.cells].join(';'))].join('\r\n') + '\r\n'
}
