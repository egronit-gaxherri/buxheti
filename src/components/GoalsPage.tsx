import { useState } from 'react'
import type { Goal } from '../db/schema'
import { goalProgress, savedOf } from '../lib/goals'
import { formatEUR } from '../lib/money'
import { todayStr } from '../lib/dates'
import { statusLine, TONE_CLASS } from './GoalSheets'

interface Props {
  goals: Goal[]
  onAdd: () => void
  onOpen: (id: string) => void
}

export function GoalCard({ g, onOpen, compact }: { g: Goal; onOpen: () => void; compact?: boolean }) {
  const today = todayStr()
  const p = goalProgress(g, today)
  const st = statusLine(g, today)
  return (
    <button onClick={onOpen} className={`w-full rounded-2xl bg-surface text-left active:bg-surface-2 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid shrink-0 place-items-center rounded-full bg-surface-2 ${compact ? 'size-9 text-lg' : 'size-11 text-xl'}`}>{g.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{g.name}</span>
          <span className={`block truncate text-xs ${TONE_CLASS[st.tone]}`}>{st.text}</span>
        </span>
        <span className="text-right">
          <span className="tabnum block font-semibold">{formatEUR(p.saved)}</span>
          <span className="tabnum text-xs text-muted">nga {formatEUR(g.target)}</span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${p.pct * 100}%`, background: g.color || '#4ade80' }} />
      </div>
    </button>
  )
}

export function GoalsPage({ goals, onAdd, onOpen }: Props) {
  const [archived, setArchived] = useState(false)
  const active = goals.filter((g) => !g.archived)
  const list = goals.filter((g) => g.archived === archived).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.createdAt - b.createdAt)
  const totalSaved = active.reduce((a, g) => a + savedOf(g), 0)
  const totalTarget = active.reduce((a, g) => a + g.target, 0)

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <section className="rounded-3xl bg-surface p-5">
          <div className="text-sm text-muted">Të kursyera gjithsej</div>
          <div className="tabnum mt-1 text-3xl font-bold">{formatEUR(totalSaved)}</div>
          <div className="tabnum text-sm text-muted">nga {formatEUR(totalTarget)} në {active.length} {active.length === 1 ? 'qëllim' : 'qëllime'}</div>
        </section>
      )}
      <button onClick={onAdd} className="h-12 w-full rounded-2xl bg-white font-semibold text-slate-900">+ Qëllim i ri</button>
      <div className="flex gap-2">
        <button onClick={() => setArchived(false)} className={`flex-1 rounded-full py-2 text-sm ${!archived ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`}>Aktive</button>
        <button onClick={() => setArchived(true)} className={`flex-1 rounded-full py-2 text-sm ${archived ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`}>Të arkivuara</button>
      </div>
      {list.length === 0 && (
        <p className="py-8 text-center text-muted">{archived ? 'Asnjë qëllim i arkivuar.' : 'Vendos një qëllim: pushime, makinë, fond emergjence…'}</p>
      )}
      <div className="space-y-2">
        {list.map((g) => <GoalCard key={g.id} g={g} onOpen={() => onOpen(g.id)} />)}
      </div>
    </div>
  )
}
