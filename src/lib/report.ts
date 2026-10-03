import type { Budget, Category, Income } from '../db/schema'
import type { MonthData } from './calc'
import { summarizeMonth } from './calc'
import { monthTotals } from './archive'
import { spendingByCategory } from './stats'
import { formatDateSQ, formatMonthSQ, toDateStr } from './dates'
import { formatEUR } from './money'
import { PdfWriter } from './pdf'

/** Raporti mujor në PDF: përmbledhje, buxhetet, kategoritë, të hyrat dhe shpenzimet sipas ditës. */
export function monthReportPdf(d: MonthData, incomes: Income[], budgets: Budget[], categories: Category[], now = new Date()): Uint8Array<ArrayBuffer> {
  const w = new PdfWriter()
  const bud = (id: string) => budgets.find((b) => b.id === id)?.name ?? '?'
  const cat = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Tjetër'
  const heading = (t: string) => {
    w.space(8)
    w.line(t, { font: 'B', size: 12, gap: 18 })
  }

  w.line('Buxheti — Raporti i muajit', { font: 'B', size: 18, gap: 24 })
  w.line(formatMonthSQ(d.monthKey), { font: 'B', size: 14, gap: 18 })
  w.line(`Gjeneruar më ${formatDateSQ(toDateStr(now))}`, { size: 9, gray: 0.45, gap: 16 })

  const t = monthTotals(d)
  heading('Përmbledhje')
  for (const [label, v] of [['Të hyra', t.income], ['Shpenzime', t.spent], ['Kursim (të hyra − shpenzime)', t.saved]] as const)
    w.cols([{ text: label, width: 40 }, { text: formatEUR(v), width: 16, right: true }])

  heading('Buxhetet')
  w.cols([{ text: 'Buxheti', width: 16 }, { text: 'Total', width: 14, right: true }, { text: 'Shpenzuar', width: 14, right: true }, { text: 'Mbetur', width: 14, right: true }], { gray: 0.45 })
  for (const s of summarizeMonth(d))
    w.cols([{ text: bud(s.budgetId), width: 16 }, { text: formatEUR(s.total), width: 14, right: true }, { text: formatEUR(s.spent), width: 14, right: true }, { text: formatEUR(s.remaining), width: 14, right: true }])

  const byCat = spendingByCategory(d.expenses)
  if (byCat.length) {
    heading('Sipas kategorisë')
    for (const c of byCat)
      w.cols([{ text: cat(c.categoryId), width: 24 }, { text: formatEUR(c.amount), width: 14, right: true }, { text: `${Math.round((c.amount / t.spent) * 100)}%`, width: 6, right: true }])
  }

  const monthIncomes = incomes.filter((i) => i.monthKey === d.monthKey).sort((a, b) => a.date.localeCompare(b.date))
  if (monthIncomes.length) {
    heading('Të hyra')
    for (const i of monthIncomes) {
      const parts = d.incomeSplits.filter((s) => s.incomeId === i.id).map((s) => `${bud(s.budgetId)} ${formatEUR(s.amount)}`).join(', ')
      w.cols([{ text: formatDateSQ(i.date), width: 11 }, { text: i.source, width: 14 }, { text: formatEUR(i.amount), width: 13, right: true }, { text: parts, width: 50 }])
    }
  }

  if (d.transfers.length || d.adjustments.length) {
    heading('Transferime dhe korrigjime')
    for (const x of d.transfers)
      w.cols([{ text: formatDateSQ(x.date), width: 11 }, { text: `${bud(x.fromBudgetId)} → ${bud(x.toBudgetId)}`, width: 30 }, { text: formatEUR(x.amount), width: 13, right: true }, { text: x.note ?? '', width: 30 }])
    for (const a of d.adjustments)
      w.cols([{ text: formatDateSQ(a.date), width: 11 }, { text: `Korrigjim · ${bud(a.budgetId)}`, width: 30 }, { text: formatEUR(a.amount, { sign: true }), width: 13, right: true }])
  }

  heading('Shpenzimet')
  if (d.expenses.length === 0) w.line('Asnjë shpenzim.', { gray: 0.45 })
  const days = [...new Set(d.expenses.map((e) => e.date))].sort()
  for (const day of days) {
    const items = d.expenses.filter((e) => e.date === day).sort((a, b) => a.createdAt - b.createdAt)
    w.ensure(30)
    w.space(4)
    w.cols([{ text: `Blerjet me datën ${formatDateSQ(day)}`, width: 71 }, { text: formatEUR(items.reduce((a, e) => a + e.amount, 0)), width: 14, right: true }], { font: 'M', size: 9 })
    for (const e of items)
      w.cols([{ text: `  ${e.description || cat(e.categoryId)}`, width: 34 }, { text: cat(e.categoryId), width: 18 }, { text: bud(e.budgetId), width: 17 }, { text: formatEUR(e.amount), width: 14, right: true }], { gray: 0.25 })
  }
  return w.build()
}
