import { useState } from 'react'
import { addBudget, addCategory, deleteBudget, deleteCategory, parseKeywords, updateBudget, updateCategory } from '../db/actions'
import type { Budget, Category } from '../db/schema'

const BUDGET_COLORS = ['#38bdf8', '#a78bfa', '#4ade80', '#fb923c', '#f472b6', '#facc15', '#2dd4bf', '#f87171']
const CATEGORY_ICONS = ['🛒', '⛽', '🧾', '🏠', '☕', '🚌', '💊', '👕', '🎬', '🎁', '🐾', '📚', '🏋️', '✈️', '🔧', '📦']

interface Props {
  budgets: Budget[]
  categories: Category[]
}

/** Menaxhimi i buxheteve (zarfeve) dhe kategorive me fjalët kyçe për auto-kategorizim. */
export function CustomizePage({ budgets, categories }: Props) {
  const [section, setSection] = useState<'budgets' | 'categories'>('budgets')
  const [error, setError] = useState('')

  // Buxhetet
  const [bName, setBName] = useState('')
  const [bColor, setBColor] = useState(BUDGET_COLORS[2])
  const [editBudgetId, setEditBudgetId] = useState<string | null>(null)

  // Kategoritë
  const [cName, setCName] = useState('')
  const [cIcon, setCIcon] = useState('🛒')
  const [cKeywords, setCKeywords] = useState('')
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function startEditBudget(b: Budget) {
    setEditBudgetId(b.id)
    setBName(b.name)
    setBColor(b.color)
  }

  function resetBudgetForm() {
    setEditBudgetId(null)
    setBName('')
    setBColor(BUDGET_COLORS[budgets.length % BUDGET_COLORS.length])
  }

  function startEditCat(c: Category) {
    setEditCatId(c.id)
    setAddingCat(true)
    setCName(c.name)
    setCIcon(c.icon)
    setCKeywords(c.keywords.join(', '))
  }

  function resetCatForm() {
    setEditCatId(null)
    setAddingCat(false)
    setCName('')
    setCIcon('🛒')
    setCKeywords('')
  }

  const chip = (on: boolean) => `flex-1 rounded-full py-2 text-sm ${on ? 'bg-white font-semibold text-slate-900' : 'bg-surface-2'}`

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={chip(section === 'budgets')} onClick={() => { setSection('budgets'); setError('') }}>
          Buxhetet ({budgets.length})
        </button>
        <button className={chip(section === 'categories')} onClick={() => { setSection('categories'); setError('') }}>
          Kategoritë ({categories.length})
        </button>
      </div>

      {error && <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}

      {section === 'budgets' && (
        <div className="space-y-4">
          <p className="px-1 text-sm text-muted">
            Zarfet ku ndahen të hyrat dhe nga ku paguhen shpenzimet (p.sh. Shtëpi, Personal, Kursime, Biznes).
          </p>

          <ul className="space-y-2">
            {budgets.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
                <span className="size-4 shrink-0 rounded-full" style={{ background: b.color }} />
                <span className="min-w-0 flex-1 font-medium">
                  {b.name}
                  {b.shared && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Familja</span>}
                </span>
                <button onClick={() => startEditBudget(b)} className="text-xs text-sky-300">Ndrysho</button>
                {budgets.length > 1 && (
                  <button
                    onClick={() => confirm(`Të fshihet buxheti "${b.name}"?`) && run(() => deleteBudget(b.id))}
                    className="text-xs text-red-400"
                  >
                    Fshi
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="space-y-3 rounded-3xl bg-surface p-4">
            <h2 className="text-sm font-semibold">{editBudgetId ? 'Ndrysho buxhetin' : 'Shto buxhet të ri'}</h2>
            <input
              value={bName}
              onChange={(e) => setBName(e.target.value)}
              placeholder="Emri (p.sh. Kursime, Makinë)"
              aria-label="Emri i buxhetit"
              className="h-12 w-full rounded-xl bg-surface-2 px-4 outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {BUDGET_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setBColor(col)}
                  aria-label={`Ngjyra ${col}`}
                  className={`size-9 rounded-full transition ${bColor === col ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : 'opacity-75'}`}
                  style={{ background: col }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {editBudgetId && (
                <button onClick={resetBudgetForm} className="h-11 flex-1 rounded-xl bg-surface-2 text-sm">
                  Anulo
                </button>
              )}
              <button
                disabled={!bName.trim()}
                onClick={() =>
                  run(async () => {
                    if (editBudgetId) await updateBudget(editBudgetId, { name: bName, color: bColor })
                    else await addBudget({ name: bName, color: bColor })
                    resetBudgetForm()
                  })
                }
                className="h-11 flex-1 rounded-xl bg-white font-semibold text-slate-900 disabled:opacity-35"
              >
                {editBudgetId ? 'Ruaj ndryshimet' : '+ Shto buxhet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {section === 'categories' && (
        <div className="space-y-4">
          <p className="px-1 text-sm text-muted">
            Fjalët kyçe përdoren për të zgjedhur automatikisht kategorinë kur shkruan përshkrimin e shpenzimit.
          </p>

          {!addingCat ? (
            <button onClick={() => setAddingCat(true)} className="h-12 w-full rounded-2xl border border-dashed border-line text-muted active:bg-surface">
              + Shto kategori të re
            </button>
          ) : (
            <div className="space-y-3 rounded-3xl bg-surface p-4">
              <h2 className="text-sm font-semibold">{editCatId ? 'Ndrysho kategorinë' : 'Kategori e re'}</h2>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setCIcon(ic)}
                    className={`grid size-10 place-items-center rounded-xl text-lg ${cIcon === ic ? 'bg-white text-slate-900' : 'bg-surface-2'}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Emri i kategorisë (p.sh. Arsim)"
                aria-label="Emri i kategorisë"
                className="h-12 w-full rounded-xl bg-surface-2 px-4 outline-none"
              />
              <input
                value={cKeywords}
                onChange={(e) => setCKeywords(e.target.value)}
                placeholder="Fjalë kyçe me presje (p.sh. liber, kurs, shkolle)"
                aria-label="Fjalë kyçe"
                className="h-12 w-full rounded-xl bg-surface-2 px-4 text-sm outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={resetCatForm} className="h-11 rounded-xl bg-surface-2 text-sm">Anulo</button>
                <button
                  disabled={!cName.trim()}
                  onClick={() =>
                    run(async () => {
                      const keywords = parseKeywords(cKeywords)
                      if (editCatId) await updateCategory(editCatId, { name: cName, icon: cIcon, keywords })
                      else await addCategory({ name: cName, icon: cIcon, keywords })
                      resetCatForm()
                    })
                  }
                  className="h-11 rounded-xl bg-white font-semibold text-slate-900 disabled:opacity-35"
                >
                  Ruaj
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="rounded-2xl bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-lg">{c.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {c.keywords.length > 0 ? c.keywords.join(', ') : 'Pa fjalë kyçe'}
                    </div>
                  </div>
                  <button onClick={() => startEditCat(c)} className="text-xs text-sky-300">Ndrysho</button>
                  {categories.length > 1 && (
                    <button
                      onClick={() => confirm(`Të fshihet kategoria "${c.name}"? Shpenzimet e saj do të kalojnë te Tjetër.`) && run(() => deleteCategory(c.id))}
                      className="text-xs text-red-400"
                    >
                      Fshi
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
