import type { Budget } from '../db/schema'
import type { BudgetSummary } from '../lib/calc'
import { formatEUR } from '../lib/money'
import { formatDateSQ } from '../lib/dates'
import type { Forecast } from '../lib/stats'

export function BudgetCard({ budget, s, forecast }: { budget: Budget; s: BudgetSummary; forecast?: Forecast }) {
  const pct = s.total > 0 ? Math.max(0, Math.min(100, (s.remaining / s.total) * 100)) : 0
  const color = s.low ? 'var(--color-danger)' : budget.color
  return (
    <section className="rounded-3xl bg-surface p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="size-3 rounded-full" style={{ background: budget.color }} />
        <span className="font-medium text-white/90">{budget.name}</span>
      </div>
      <div className="tabnum mt-2 text-4xl font-bold tracking-tight" style={{ color: s.remaining < 0 ? 'var(--color-danger)' : undefined }}>
        {formatEUR(s.remaining)}
      </div>
      <div className="mt-0.5 text-sm text-muted">mbetur</div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="tabnum mt-2 flex justify-between text-sm text-muted">
        <span>Shpenzuar {formatEUR(s.spent)}</span>
        <span>Total {formatEUR(s.total)}</span>
      </div>

      {forecast && <ForecastLine f={forecast} />}

      {s.daysLeft > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <div className="text-xs text-muted">Sa mund të shpenzoj sot</div>
            <div className="tabnum text-xl font-semibold" style={{ color: s.perDay === 0 && s.total > 0 ? 'var(--color-danger)' : undefined }}>
              {formatEUR(s.perDay)}
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            edhe {s.daysLeft} {s.daysLeft === 1 ? 'ditë' : 'ditë'}
            <br />
            në muaj
          </div>
        </div>
      )}
    </section>
  )
}

function ForecastLine({ f }: { f: Forecast }) {
  if (f.kind === 'none') return null
  if (f.kind === 'empty') return <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">⚠ Paratë e këtij buxheti kanë mbaruar.</p>
  if (f.kind === 'runout')
    return (
      <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
        ⚠ {f.reason === 'fixed' ? 'Mbetja nuk mjafton për shpenzimet e përsëritura që vijnë.' : `Me ritmin aktual paratë mbarojnë më ${formatDateSQ(f.date)}.`}
      </p>
    )
  return <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">✓ Me këtë ritëm, deri në fund të muajit mbeten rreth {formatEUR(f.projectedLeft)}.</p>
}
