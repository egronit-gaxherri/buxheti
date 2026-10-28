export type MoreView = 'customize' | 'goals' | 'family' | 'people' | 'debts' | 'moves' | 'recurring' | 'limits' | 'archive' | 'security'

const ITEMS: { id: MoreView; icon: string; title: string; hint: string }[] = [
  { id: 'customize', icon: '🏷️', title: 'Buxhetet & kategoritë', hint: 'Zarfet, ngjyrat, kategoritë dhe fjalët kyçe' },
  { id: 'goals', icon: '🎯', title: 'Qëllimet e kursimit', hint: 'Pushime, makinë, fond emergjence — me progres' },
  { id: 'family', icon: '🏡', title: 'Familja & sinkronizimi', hint: 'Ndaj Shtëpinë me familjarët në telefonat e tyre' },
  { id: 'people', icon: '👥', title: 'Personat', hint: 'Kush jep para për shtëpi dhe sa gjithsej' },
  { id: 'debts', icon: '🤝', title: 'Borxhet', hint: 'Kush i ka borxh kujt, pagesat dhe afatet' },
  { id: 'moves', icon: '💶', title: 'Të hyra & transferime', hint: 'Rroga, ndarja mes buxheteve, transferimet' },
  { id: 'recurring', icon: '🔁', title: 'Shpenzime të përsëritura', hint: 'Qira, fatura, internet' },
  { id: 'limits', icon: '🎯', title: 'Limite sipas kategorisë', hint: 'Alarm në 80% dhe 100%' },
  { id: 'archive', icon: '🗂️', title: 'Muajt & arkivi', hint: 'Mbyllja e muajit, bartja, tendenca vjetore' },
  { id: 'security', icon: '🔐', title: 'Siguria & të dhënat', hint: 'PIN, Face ID, backup, CSV/PDF' },
]

export const MORE_TITLES: Record<MoreView, string> = {
  customize: 'Buxhetet & kategoritë',
  goals: 'Qëllimet',
  family: 'Familja',
  people: 'Personat',
  debts: 'Borxhet',
  moves: 'Të hyra & transferime',
  recurring: 'Të përsëritura',
  limits: 'Limitet',
  archive: 'Muajt & arkivi',
  security: 'Siguria & të dhënat',
}

export function MorePage({ onOpen, onImport, onReconcile }: { onOpen: (v: MoreView) => void; onImport: () => void; onReconcile: () => void }) {
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
    </div>
  )
}
