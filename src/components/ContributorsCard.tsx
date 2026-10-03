import type { Budget, Income, IncomeSplit, Person } from '../db/schema'
import { contributionsByPerson, ME } from '../lib/people'
import { formatEUR } from '../lib/money'

interface Props {
  incomes: Income[]
  splits: IncomeSplit[]
  people: Person[]
  budgets: Budget[]
  onOpen: () => void
  meId?: string
}

/** Ballina: kush dha para këtë muaj dhe ku shkuan. */
export function ContributorsCard({ incomes, splits, people, budgets, onOpen, meId }: Props) {
  const contrib = contributionsByPerson(incomes, splits, meId)
  if (contrib.length === 0) return null
  const name = (k: string) => (k === ME ? 'Unë (rrogë)' : (people.find((p) => p.id === k)?.name ?? '?'))
  const color = (k: string) => (k === ME ? '#94a3b8' : (people.find((p) => p.id === k)?.color ?? '#94a3b8'))
  return (
    <button onClick={onOpen} className="w-full rounded-3xl bg-surface p-5 text-left active:bg-surface-2">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Kush dha para</h2>
        <span className="tabnum text-sm text-muted">{formatEUR(contrib.reduce((a, c) => a + c.total, 0))} ›</span>
      </div>
      <ul className="space-y-2">
        {contrib.map((c) => (
          <li key={c.key} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(c.key) }} />
            <span className="min-w-0 flex-1 truncate">
              {name(c.key)}
              <span className="text-muted"> · {budgets.filter((b) => c.byBudget[b.id]).map((b) => b.name).join(' + ')}</span>
            </span>
            <span className="tabnum font-semibold">{formatEUR(c.total)}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}
