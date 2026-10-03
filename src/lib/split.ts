export interface SplitRow {
  budgetId: string
  mode: 'eur' | 'pct'
  value: string
}

export function parsePercent(s: string): number {
  const n = Number(s.trim().replace(',', '.').replace('%', ''))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

/**
 * Kthen shumat (cent) për çdo buxhet dhe sa mbetet pa ndarë.
 * Kur gjithçka ndahet me përqindje që bëjnë 100%, centët e mbetur nga rrumbullakimi
 * u jepen pjesëve me pjesën dhjetore më të madhe — kështu shuma përputhet saktësisht.
 */
export function resolveSplits(total: number, rows: SplitRow[], parseEur: (s: string) => number) {
  const amounts: Record<string, number> = {}
  const pctRows = rows.filter((r) => r.mode === 'pct' && parsePercent(r.value) > 0)
  const eurRows = rows.filter((r) => r.mode === 'eur' && parseEur(r.value) > 0)

  for (const r of eurRows) amounts[r.budgetId] = parseEur(r.value)

  const exact = pctRows.map((r) => ({ id: r.budgetId, x: (total * parsePercent(r.value)) / 100 }))
  const pctSum = pctRows.reduce((a, r) => a + parsePercent(r.value), 0)
  const floors = exact.map((e) => ({ ...e, f: Math.floor(e.x + 1e-9) }))
  if (eurRows.length === 0 && Math.abs(pctSum - 100) < 1e-9 && floors.length > 0) {
    let left = total - floors.reduce((a, e) => a + e.f, 0)
    for (const e of [...floors].sort((a, b) => b.x - b.f - (a.x - a.f))) {
      if (left <= 0) break
      e.f += 1
      left -= 1
    }
  } else {
    for (const e of floors) e.f = Math.round(e.x)
  }
  for (const e of floors) amounts[e.id] = (amounts[e.id] ?? 0) + e.f

  const unallocated = total - Object.values(amounts).reduce((a, b) => a + b, 0)
  return { amounts, unallocated }
}
