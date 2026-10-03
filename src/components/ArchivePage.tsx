import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { loadMonthData, loadYear, monthsWithData } from '../db/queries'
import { monthTotals, yearTrend } from '../lib/archive'
import { currentMonthKey, formatMonthSQ, MONTH_NAMES } from '../lib/dates'
import { formatEUR } from '../lib/money'

interface Props {
  onOpenMonth: (monthKey: string) => void
  onClose: (monthKey: string) => void
}

export function ArchivePage({ onOpenMonth, onClose }: Props) {
  const [year, setYear] = useState(Number(currentMonthKey().slice(0, 4)))
  const trend = useLiveQuery(async () => {
    const { splits, expenses } = await loadYear(year)
    return yearTrend(year, splits, expenses)
  }, [year])
  const months = useLiveQuery(async () => {
    const keys = await monthsWithData()
    return Promise.all(keys.map(async (k) => ({ ...monthTotals(await loadMonthData(k)), closed: !!(await db.months.get(k))?.closed })))
  }, [])

  if (!trend || !months) return null
  const max = Math.max(1, ...trend.flatMap((t) => [t.income, t.spent]))
  const withData = trend.filter((t) => t.income || t.spent)
  const tot = trend.reduce((a, t) => ({ income: a.income + t.income, spent: a.spent + t.spent }), { income: 0, spent: 0 })
  const cur = currentMonthKey()

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setYear(year - 1)} className="grid size-9 place-items-center rounded-full bg-surface-2" aria-label="Viti i kaluar">‹</button>
          <h2 className="font-semibold">Tendenca {year}</h2>
          <button onClick={() => setYear(year + 1)} disabled={year >= Number(cur.slice(0, 4))} className="grid size-9 place-items-center rounded-full bg-surface-2 disabled:opacity-30" aria-label="Viti tjetër">›</button>
        </div>
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`Të hyrat dhe shpenzimet sipas muajve ${year}`}>
          {trend.map((t) => (
            <button key={t.monthKey} onClick={() => (t.income || t.spent) && onOpenMonth(t.monthKey)} className="flex h-full flex-1 items-end gap-[2px]" aria-label={`${formatMonthSQ(t.monthKey)}: të hyra ${formatEUR(t.income)}, shpenzime ${formatEUR(t.spent)}`}>
              <span className="flex-1 rounded-t-sm bg-emerald-400" style={{ height: `${(t.income / max) * 100}%`, minHeight: t.income ? 3 : 0 }} />
              <span className="flex-1 rounded-t-sm bg-sky-400" style={{ height: `${(t.spent / max) * 100}%`, minHeight: t.spent ? 3 : 0 }} />
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-[9px] text-muted">
          {MONTH_NAMES.map((m) => <span key={m} className="flex-1 text-center">{m.slice(0, 3)}</span>)}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-400" />Të hyra</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sky-400" />Shpenzime</span>
        </div>
        <dl className="tabnum mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Të hyra vjetore</dt><dd className="font-semibold">{formatEUR(tot.income)}</dd></div>
          <div><dt className="text-muted">Shpenzime vjetore</dt><dd className="font-semibold">{formatEUR(tot.spent)}</dd></div>
          <div><dt className="text-muted">Kursim</dt><dd className={`font-semibold ${tot.income - tot.spent < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatEUR(tot.income - tot.spent)}</dd></div>
          <div><dt className="text-muted">Mesatarja mujore e shpenzimeve</dt><dd className="font-semibold">{formatEUR(withData.length ? Math.round(tot.spent / withData.length) : 0)}</dd></div>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-lg font-semibold">Muajt</h2>
        {months.length === 0 && <p className="py-6 text-center text-muted">Ende asnjë muaj me të dhëna.</p>}
        <ul className="space-y-2">
          {months.map((m) => (
            <li key={m.monthKey} className="rounded-2xl bg-surface p-4">
              <div className="flex items-center justify-between">
                <button onClick={() => onOpenMonth(m.monthKey)} className="font-medium">{formatMonthSQ(m.monthKey)} ›</button>
                {m.closed ? (
                  <button onClick={() => onClose(m.monthKey)} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">🔒 E mbyllur</button>
                ) : m.monthKey <= cur ? (
                  <button onClick={() => onClose(m.monthKey)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900">Mbyll muajin</button>
                ) : null}
              </div>
              <div className="tabnum mt-2 grid grid-cols-3 gap-2 text-xs">
                <span><span className="block text-muted">Të hyra</span>{formatEUR(m.income)}</span>
                <span><span className="block text-muted">Shpenzime</span>{formatEUR(m.spent)}</span>
                <span><span className="block text-muted">Kursim</span><span className={m.saved < 0 ? 'text-red-300' : 'text-emerald-300'}>{formatEUR(m.saved)}</span></span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
