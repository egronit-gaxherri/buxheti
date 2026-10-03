import { useState } from 'react'
import { formatEUR } from '../lib/money'

export interface Slice {
  id: string
  label: string
  color: string
  value: number
}

/** Donut me SVG: shpenzimet sipas kategorisë. */
export function DonutChart({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const R = 62
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 160 160" className="size-48 -rotate-90" role="img" aria-label="Shpenzimet sipas kategorisë">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="22" />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * C
            const el = (
              <circle key={s.id} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`} strokeDashoffset={-offset} />
            )
            offset += len
            return el
          })}
        <g className="rotate-90 origin-center" style={{ transformOrigin: '80px 80px' }}>
          <text x="80" y="76" textAnchor="middle" fill="var(--color-muted)" fontSize="9">Gjithsej</text>
          <text x="80" y="94" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">{formatEUR(total)}</text>
        </g>
      </svg>
      <ul className="w-full space-y-2">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <span className="size-3 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="tabnum text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            <span className="tabnum w-24 text-right font-semibold">{formatEUR(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Shpenzimet ditore: një shufër për ditë; prek një shufër për shumën. */
export function DailyBars({ days, todayDay }: { days: number[]; todayDay: number | null }) {
  const [sel, setSel] = useState<number | null>(todayDay ? todayDay - 1 : null)
  const max = Math.max(...days, 1)
  const label = (i: number) => i === 0 || (i + 1) % 5 === 0 || (i === days.length - 1 && days.length % 5 >= 3)
  return (
    <div>
      <div className="mb-2 h-6 text-sm">
        {sel != null && (
          <span>
            <span className="text-muted">Dita {sel + 1}: </span>
            <span className="tabnum font-semibold">{formatEUR(days[sel])}</span>
          </span>
        )}
      </div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Shpenzimet ditore">
        {days.map((v, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            aria-label={`Dita ${i + 1}: ${formatEUR(v)}`}
            className="flex h-full flex-1 items-end"
          >
            <span
              className="w-full rounded-t-sm"
              style={{
                height: `${v > 0 ? Math.max((v / max) * 100, 4) : 2}%`,
                background: i === sel ? '#fff' : v > 0 ? '#38bdf8' : 'var(--color-surface-2)',
                opacity: todayDay && i + 1 > todayDay ? 0.35 : 1,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[9px] text-muted">
        {days.map((_, i) => (
          <span key={i} className="flex-1 text-center">{label(i) ? i + 1 : ''}</span>
        ))}
      </div>
    </div>
  )
}
