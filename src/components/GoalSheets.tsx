import { useState } from 'react'
import { Sheet } from './Sheet'
import { addGoal, deleteGoal, deleteGoalContribution, goalMove, updateGoal } from '../db/actions'
import type { Budget, Goal } from '../db/schema'
import { GOAL_ICONS, goalProgress } from '../lib/goals'
import { formatEUR, parseAmount } from '../lib/money'
import { formatDateSQ, formatMonthSQ, todayStr } from '../lib/dates'

const toText = (c: number) => (c / 100).toFixed(2).replace('.', ',').replace(',00', '')

/** Krijo ose ndrysho një qëllim (emri, ikona, shuma, afati, kursimi automatik). */
export function GoalEditSheet({ goal, budgets, onClose }: { goal?: Goal; budgets: Budget[]; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? '🎯')
  const [target, setTarget] = useState(goal ? toText(goal.target) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [autoOn, setAutoOn] = useState(!!goal?.auto)
  const [autoAmount, setAutoAmount] = useState(goal?.auto ? toText(goal.auto.amount) : '')
  const [autoBudget, setAutoBudget] = useState(goal?.auto?.budgetId ?? budgets[1]?.id ?? budgets[0].id)
  const [autoDay, setAutoDay] = useState(String(goal?.auto?.dayOfMonth ?? 1))
  const [error, setError] = useState('')

  const t = parseAmount(target) ?? 0
  const preview = t > 0 && deadline ? goalProgress({ id: '', name, icon, color: '', target: t, deadline, contributions: goal?.contributions ?? [], archived: false, createdAt: 0 }, todayStr()) : null

  async function save() {
    setError('')
    try {
      const auto = autoOn ? { amount: parseAmount(autoAmount) ?? 0, budgetId: autoBudget, dayOfMonth: Number(autoDay) || 1 } : undefined
      if (goal) await updateGoal(goal.id, { name, icon, target: t, deadline: deadline || undefined, auto: auto ?? null })
      else await addGoal({ name, icon, target: t, deadline: deadline || undefined, auto })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={goal ? 'Ndrysho qëllimin' : 'Qëllim i ri'} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          {GOAL_ICONS.map((i) => (
            <button key={i} onClick={() => setIcon(i)} className={`grid size-11 place-items-center rounded-xl text-xl ${icon === i ? 'bg-white' : 'bg-surface-2'}`} aria-label={`Ikona ${i}`}>
              {i}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emri (p.sh. Pushime në verë)" aria-label="Emri i qëllimit" className="h-12 rounded-2xl bg-surface-2 px-4 outline-none" />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Shuma e synuar</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="600" aria-label="Shuma e synuar" className="h-12 rounded-2xl bg-surface-2 px-4 text-lg font-semibold outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Afati (opsional)</span>
            <input type="date" value={deadline} min={todayStr()} onChange={(e) => setDeadline(e.target.value)} aria-label="Afati i qëllimit" className="h-12 rounded-2xl bg-surface-2 px-3 outline-none" />
          </label>
        </div>
        {preview?.perMonth && <p className="text-sm text-sky-300">Duhen rreth {formatEUR(preview.perMonth)} në muaj për {preview.monthsLeft} muaj.</p>}

        <label className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
          <span className="flex-1">
            <span className="block font-medium">Kursim automatik çdo muaj</span>
            <span className="text-xs text-muted">Vihet mënjanë vetë në datën e caktuar</span>
          </span>
          <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="size-6 accent-sky-400" />
        </label>
        {autoOn && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-4">
            <div className="flex gap-2">
              <input value={autoAmount} onChange={(e) => setAutoAmount(e.target.value)} inputMode="decimal" placeholder={preview?.perMonth ? toText(preview.perMonth) : 'Shuma €'} aria-label="Shuma mujore" className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 outline-none" />
              <input value={autoDay} onChange={(e) => setAutoDay(e.target.value)} inputMode="numeric" aria-label="Dita e muajit" className="h-11 w-16 rounded-xl bg-bg text-center outline-none" />
            </div>
            <div className="text-xs text-muted">Shuma · dita e muajit (1–31) · nga buxheti:</div>
            <div className="flex gap-2">
              {budgets.map((b) => (
                <button key={b.id} onClick={() => setAutoBudget(b.id)} className="h-10 flex-1 rounded-xl text-sm font-semibold" style={autoBudget === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-bg)' }}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button disabled={!name.trim() || t <= 0} onClick={save} className="h-14 rounded-2xl bg-white text-lg font-bold text-slate-900 disabled:opacity-35">Ruaj</button>
      </div>
    </Sheet>
  )
}

export function statusLine(g: Goal, today: string): { text: string; tone: 'good' | 'warn' | 'info' } {
  const p = goalProgress(g, today)
  switch (p.status) {
    case 'achieved':
      return { text: '🎉 U arrit!', tone: 'good' }
    case 'overdue':
      return { text: `Afati kaloi më ${formatDateSQ(g.deadline!)} — mungojnë ${formatEUR(p.left)}`, tone: 'warn' }
    case 'on-track':
      return { text: `Në rrugë të mbarë · arrihet rreth ${formatMonthSQ(p.projectedMonth!)}`, tone: 'good' }
    case 'behind':
      return { text: `Prapa · duhen ${formatEUR(p.perMonth!)}/muaj deri më ${formatDateSQ(g.deadline!)}`, tone: 'warn' }
    case 'not-started':
      return { text: p.perMonth ? `Duhen ${formatEUR(p.perMonth)}/muaj deri më ${formatDateSQ(g.deadline!)}` : 'Ende pa kursim', tone: 'info' }
    default:
      return { text: p.projectedMonth ? `Me këtë ritëm arrihet rreth ${formatMonthSQ(p.projectedMonth)}` : 'Pa afat', tone: 'info' }
  }
}

export const TONE_CLASS = { good: 'text-emerald-300', warn: 'text-amber-300', info: 'text-muted' } as const

/** Detajet: shto/tërhiq para, historiku, ndrysho, arkivo, fshi. */
export function GoalDetailSheet({ goal, budgets, onClose, onEdit }: { goal: Goal; budgets: Budget[]; onClose: () => void; onEdit: () => void }) {
  const today = todayStr()
  const p = goalProgress(goal, today)
  const [mode, setMode] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState(p.perMonth ? toText(Math.min(p.perMonth, p.left)) : '')
  const [budgetId, setBudgetId] = useState(goal.auto?.budgetId ?? budgets[1]?.id ?? budgets[0].id)
  const [error, setError] = useState('')
  const st = statusLine(goal, today)
  const bud = (id?: string) => budgets.find((b) => b.id === id)?.name

  async function move() {
    setError('')
    try {
      const a = parseAmount(amount) ?? 0
      await goalMove(goal.id, { amount: mode === 'in' ? a : -a, budgetId: budgetId || undefined })
      setAmount('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={`${goal.icon} ${goal.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="tabnum text-4xl font-bold">{formatEUR(p.saved)}</div>
          <div className="text-sm text-muted">nga {formatEUR(goal.target)} · {Math.round(p.pct * 100)}%</div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${p.pct * 100}%`, background: goal.color || '#4ade80' }} />
          </div>
          <p className={`mt-2 text-sm ${TONE_CLASS[st.tone]}`}>{st.text}</p>
          {goal.auto && <p className="mt-1 text-xs text-muted">🔄 Automatik: {formatEUR(goal.auto.amount)} çdo {goal.auto.dayOfMonth} të muajit nga {bud(goal.auto.budgetId)}</p>}
          {p.pace > 0 && <p className="mt-1 text-xs text-muted">Ritmi yt: rreth {formatEUR(p.pace)} në muaj</p>}
        </div>

        <section className="space-y-2 rounded-2xl bg-surface-2 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('in')} className={`h-10 rounded-xl text-sm font-semibold ${mode === 'in' ? 'bg-white text-slate-900' : 'bg-bg'}`}>Kurse</button>
            <button onClick={() => setMode('out')} disabled={p.saved === 0} className={`h-10 rounded-xl text-sm font-semibold disabled:opacity-40 ${mode === 'out' ? 'bg-white text-slate-900' : 'bg-bg'}`}>Tërhiq</button>
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Shuma (€)" aria-label="Shuma për qëllimin" className="h-12 w-full rounded-xl bg-bg px-3 text-lg outline-none" />
          <div className="text-xs text-muted">{mode === 'in' ? 'Nga buxheti:' : 'Kthe te buxheti:'}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${budgets.length + 1}, 1fr)` }}>
            {budgets.map((b) => (
              <button key={b.id} onClick={() => setBudgetId(b.id)} className="h-10 rounded-xl text-sm font-semibold" style={budgetId === b.id ? { background: b.color, color: '#0f172a' } : { background: 'var(--color-bg)' }}>
                {b.name}
              </button>
            ))}
            <button onClick={() => setBudgetId('')} className={`h-10 rounded-xl text-xs font-semibold ${budgetId === '' ? 'bg-white text-slate-900' : 'bg-bg'}`}>Jashtë</button>
          </div>
          <button onClick={move} disabled={(parseAmount(amount) ?? 0) <= 0} className="h-12 w-full rounded-xl bg-white font-bold text-slate-900 disabled:opacity-35">
            {mode === 'in' ? 'Vëri mënjanë' : 'Tërhiqi'}
          </button>
          <p className="text-xs text-muted">Paratë dalin nga buxheti (ose kthehen), por nuk llogariten si shpenzim. "Jashtë" = para që s'janë në asnjë buxhet.</p>
        </section>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        {goal.contributions.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Historiku</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
              {[...goal.contributions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 text-muted">
                    {formatDateSQ(c.date)}
                    {c.auto ? ' · automatik' : ''}
                    {c.budgetId ? ` · ${bud(c.budgetId)}` : ' · jashtë'}
                  </span>
                  <span className={`tabnum font-semibold ${c.amount < 0 ? 'text-red-300' : ''}`}>{formatEUR(c.amount, { sign: true })}</span>
                  <button onClick={() => confirm('Të fshihet ky veprim?') && deleteGoalContribution(goal.id, c.id)} aria-label="Fshi veprimin" className="px-1 text-muted">✕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-3 gap-2 text-sm">
          <button onClick={onEdit} className="h-12 rounded-2xl bg-surface-2">Ndrysho</button>
          <button onClick={() => updateGoal(goal.id, { archived: !goal.archived }).then(onClose)} className="h-12 rounded-2xl bg-surface-2">{goal.archived ? 'Rikthe' : 'Arkivo'}</button>
          <button
            onClick={() => confirm(`Të fshihet "${goal.name}"? ${p.saved > 0 ? `${formatEUR(p.saved)} kthehen te buxhetet nga erdhën.` : ''}`) && deleteGoal(goal.id).then(onClose)}
            className="h-12 rounded-2xl bg-red-500/15 font-semibold text-red-400"
          >
            Fshi
          </button>
        </div>
      </div>
    </Sheet>
  )
}
