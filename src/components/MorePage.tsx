import type { ReactNode } from 'react'

export type MoreView = 'moves' | 'recurring' | 'limits'

const ITEMS: { id: MoreView; icon: string; title: string; hint: string }[] = [
  { id: 'moves', icon: '💶', title: 'Të hyra & transferime', hint: 'Rroga, ndarja mes buxheteve, transferimet' },
  { id: 'recurring', icon: '🔁', title: 'Shpenzime të përsëritura', hint: 'Qira, fatura, internet' },
  { id: 'limits', icon: '🎯', title: 'Limite sipas kategorisë', hint: 'Alarm në 80% dhe 100%' },
]

export const MORE_TITLES: Record<MoreView, string> = { moves: 'Të hyra & transferime', recurring: 'Të përsëritura', limits: 'Limitet' }

export function MorePage({ onOpen, onImport, onReconcile, children }: { onOpen: (v: MoreView) => void; onImport: () => void; onReconcile: () => void; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      {ITEMS.map((i) => (
        <button key={i.id} onClick={() => onOpen(i.id)} className="flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left active:bg-surface-2">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl">{i.icon}</span>
          <span className="flex-1">
            <span className="block font-medium">{i.title}</span>
            <span className="text-xs text-muted">{i.hint}</span>
          </span>
          <span className="text-muted">›</span>
        </button>
      ))}
      <div className="px-1 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">Mjete</div>
      {[
        { icon: '📝', title: 'Import nga shënimet', hint: 'Ngjit tekstin nga Apple Notes', run: onImport },
        { icon: '⚖️', title: 'Përshtat bilancin', hint: 'Përputh mbetjen me paratë reale', run: onReconcile },
      ].map((i) => (
        <button key={i.title} onClick={i.run} className="flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left active:bg-surface-2">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl">{i.icon}</span>
          <span className="flex-1">
            <span className="block font-medium">{i.title}</span>
            <span className="text-xs text-muted">{i.hint}</span>
          </span>
          <span className="text-muted">›</span>
        </button>
      ))}
      {children}
    </div>
  )
}
