import type { ReactNode } from 'react'

interface Props {
  title?: string
  onClose: () => void
  children: ReactNode
  full?: boolean
}

/** Fletë që hapet nga poshtë. `full` = mbulon gjithë ekranin (për shtimin e shpenzimit). */
export function Sheet({ title, onClose, children, full }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className={`flex w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl ${full ? 'h-[100dvh] rounded-none' : 'max-h-[92dvh]'}`}
        style={{ animation: 'slideup .22s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Mbyll" className="grid size-10 place-items-center rounded-full bg-surface-2 text-xl text-muted">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
