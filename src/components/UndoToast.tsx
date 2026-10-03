import { useEffect } from 'react'

export const UNDO_MS = 10_000

interface Props {
  message: string
  onUndo: () => void
  onExpire: () => void
}

/** Njoftim i madh me "Zhbëj" për 10 sekonda. Remount me `key` rinis kohën. */
export function UndoToast({ message, onUndo, onExpire }: Props) {
  useEffect(() => {
    const t = setTimeout(onExpire, UNDO_MS)
    return () => clearTimeout(t)
  }, [onExpire])

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)', animation: 'pop .2s ease-out' }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl" role="status">
        <div className="flex items-center gap-3 p-4">
          <p className="flex-1 text-lg font-semibold leading-snug">{message}</p>
          <button onClick={onUndo} className="rounded-2xl bg-slate-900 px-5 py-3 text-base font-semibold text-white active:opacity-80">
            Zhbëj
          </button>
        </div>
        <div className="h-1.5 bg-slate-200">
          <div className="h-full bg-slate-900" style={{ animation: `shrink ${UNDO_MS}ms linear forwards` }} />
        </div>
      </div>
    </div>
  )
}
