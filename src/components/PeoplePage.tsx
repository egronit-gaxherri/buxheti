import { useState } from 'react'
import { addPerson, removePerson, renamePerson } from '../db/actions'
import { useAllIncomes, usePeople } from '../db/hooks'
import type { Budget } from '../db/schema'
import { contributionsByPerson, ME, personKey } from '../lib/people'
import { formatDateSQ, formatMonthSQ } from '../lib/dates'
import { formatEUR } from '../lib/money'

type Period = 'month' | 'year' | 'all'

interface Props {
  monthKey: string
  budgets: Budget[]
  onAddIncome: (personKey: string) => void
}

/** Kush jep para dhe sa: totalet sipas personit për muajin, vitin ose gjithsej. */
export function PeoplePage({ monthKey, budgets, onAddIncome }: Props) {
  const people = usePeople()
  const all = useAllIncomes()
  const [period, setPeriod] = useState<Period>('month')
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')

  if (!people || !all) return null

  const year = monthKey.slice(0, 4)
  const inPeriod = (mk: string) => (period === 'month' ? mk === monthKey : period === 'year' ? mk.startsWith(year) : true)
  const incomes = all.incomes.filter((i) => inPeriod(i.monthKey))
  const splits = all.splits.filter((s) => inPeriod(s.monthKey))
  const contrib = contributionsByPerson(incomes, splits)
  const byKey = new Map(contrib.map((c) => [c.key, c]))

  // Të gjithë personat aktivë (edhe me 0), plus "Unë" dhe të arkivuarit që kanë të hyra në periudhë
  const keys = [...new Set([...contrib.map((c) => c.key), ...people.filter((p) => !p.archived).map((p) => p.id)])]
  const label = (k: string) => (k === ME ? 'Unë (rrogë)' : (people.find((p) => p.id === k)?.name ?? '?'))
  const color = (k: string) => (k === ME ? '#94a3b8' : (people.find((p) => p.id === k)?.color ?? '#94a3b8'))
  const bud = (id: string) => budgets.find((b) => b.id === id)

  const totalsByBudget: Record<string, number> = {}
  for (const s of splits) totalsByBudget[s.budgetId] = (totalsByBudget[s.budgetId] ?? 0) + s.amount
  const othersTotal = contrib.filter((c) => c.key !== ME).reduce((a, c) => a + c.total, 0)

  async function add() {
    try {
      await addPerson(name)
      setName('')
      setMsg('')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  async function rename(id: string, current: string) {
    const n = prompt('Emri i ri', current)
    if (n && n.trim() && n.trim() !== current) await renamePerson(id, n)
  }

  async function remove(id: string, nm: string) {
    if (!confirm(`Të hiqet "${nm}" nga lista?`)) return
    const r = await removePerson(id)
    setMsg(r === 'archived' ? `${nm} u hoq nga lista; të hyrat e tij/saj mbeten në histori.` : `${nm} u fshi.`)
  }

  const periodLabel = period === 'month' ? formatMonthSQ(monthKey) : period === 'year' ? `Viti ${year}` : 'Gjithsej'
  const chip = (on: boolean) => `flex-1 rounded-full py-2 text-sm ${on ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={chip(period === 'month')} onClick={() => setPeriod('month')}>Muaji</button>
        <button className={chip(period === 'year')} onClick={() => setPeriod('year')}>Viti</button>
        <button className={chip(period === 'all')} onClick={() => setPeriod('all')}>Gjithsej</button>
      </div>

      <section className="rounded-3xl bg-surface p-5">
        <div className="text-sm text-muted">{periodLabel} · të hyra gjithsej</div>
        <div className="tabnum mt-1 text-3xl font-bold">{formatEUR(incomes.reduce((a, i) => a + i.amount, 0))}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {budgets.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1">
              <span className="size-2 rounded-full" style={{ background: b.color }} />
              {b.name} {formatEUR(totalsByBudget[b.id] ?? 0)}
            </span>
          ))}
        </div>
        {othersTotal > 0 && <p className="mt-3 text-xs text-muted">Nga të tjerët (pa rrogën tënde): {formatEUR(othersTotal)}</p>}
      </section>

      <ul className="space-y-2">
        {keys.map((k) => {
          const c = byKey.get(k)
          const hist = incomes.filter((i) => personKey(i) === k).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
          const p = people.find((x) => x.id === k)
          return (
            <li key={k} className="rounded-2xl bg-surface">
              <button onClick={() => setOpen(open === k ? null : k)} className="flex w-full items-center gap-3 p-4 text-left">
                <span className="grid size-10 shrink-0 place-items-center rounded-full font-semibold text-slate-900" style={{ background: color(k) }}>
                  {k === ME ? '🙋' : label(k).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{label(k)}{p?.archived ? ' (arkivuar)' : ''}</span>
                  <span className="block truncate text-xs text-muted">
                    {c ? budgets.filter((b) => c.byBudget[b.id]).map((b) => `${b.name} ${formatEUR(c.byBudget[b.id])}`).join(' · ') : 'Asnjë e hyrë në këtë periudhë'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabnum block font-semibold">{formatEUR(c?.total ?? 0)}</span>
                  <span className="text-xs text-muted">{c ? `${c.count}×` : ''}</span>
                </span>
              </button>
              {open === k && (
                <div className="border-t border-line px-4 pb-4 pt-3">
                  {hist.length > 0 && (
                    <ul className="mb-3 space-y-1.5 text-sm">
                      {hist.slice(0, 20).map((i) => (
                        <li key={i.id} className="flex justify-between gap-2">
                          <span className="text-muted">
                            {formatDateSQ(i.date)}
                            {all.splits.filter((s) => s.incomeId === i.id).map((s) => ` · ${bud(s.budgetId)?.name ?? '?'}`).join('')}
                            {i.note ? ` · ${i.note}` : ''}
                          </span>
                          <span className="tabnum">{formatEUR(i.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button onClick={() => onAddIncome(k)} className="rounded-full bg-white px-4 py-1.5 font-semibold text-slate-900">+ Të hyra nga {k === ME ? 'unë' : label(k)}</button>
                    {p && <button onClick={() => rename(p.id, p.name)} className="rounded-full bg-surface-2 px-4 py-1.5">Riemërto</button>}
                    {p && !p.archived && <button onClick={() => remove(p.id, p.name)} className="rounded-full bg-surface-2 px-4 py-1.5 text-red-300">Hiq</button>}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Shto person (p.sh. Mami, Babi, Edi)"
          aria-label="Emri i personit"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-surface px-4 outline-none"
        />
        <button onClick={add} disabled={!name.trim()} className="rounded-2xl bg-white px-5 font-semibold text-slate-900 disabled:opacity-35">Shto</button>
      </div>
      {msg && <p className="px-1 text-sm text-muted" role="status">{msg}</p>}
    </div>
  )
}
