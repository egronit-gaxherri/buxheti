import { useEffect, useState } from 'react'

interface Props {
  /** Nëse dihet, PIN-i dërgohet vetë sapo arrin këtë gjatësi; përndryshe shfaqet "Vazhdo" (4–6 shifra). */
  length?: number
  disabled?: boolean
  /** Ndryshoje për të pastruar tastierën (p.sh. pas një PIN-i të gabuar). */
  resetKey?: number
  onComplete: (pin: string) => void
  extraKey?: { label: string; onPress: () => void; aria: string }
}

export function PinPad({ length, disabled, resetKey, onComplete, extraKey }: Props) {
  const [pin, setPin] = useState('')
  const max = length ?? 6

  useEffect(() => setPin(''), [resetKey])

  const press = (d: string) => {
    if (disabled || pin.length >= max) return
    navigator.vibrate?.(8)
    const next = pin + d
    setPin(next)
    if (length && next.length === length) onComplete(next)
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex h-4 gap-4" aria-label={`${pin.length} shifra të futura`}>
        {Array.from({ length: length ?? Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`size-4 rounded-full border-2 border-white/70 transition ${i < pin.length ? 'bg-white' : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} disabled={disabled} onClick={() => press(d)} className="size-20 rounded-full bg-surface-2 text-3xl font-light active:bg-line disabled:opacity-40">
            {d}
          </button>
        ))}
        {extraKey ? (
          <button onClick={extraKey.onPress} aria-label={extraKey.aria} className="size-20 rounded-full text-sm text-sky-300 active:bg-surface-2">
            {extraKey.label}
          </button>
        ) : (
          <span />
        )}
        <button disabled={disabled} onClick={() => press('0')} className="size-20 rounded-full bg-surface-2 text-3xl font-light active:bg-line disabled:opacity-40">
          0
        </button>
        <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Fshi shifrën" className="size-20 rounded-full text-2xl text-muted active:bg-surface-2">
          ⌫
        </button>
      </div>
      {!length && (
        <button disabled={pin.length < 4 || disabled} onClick={() => onComplete(pin)} className="h-12 w-48 rounded-2xl bg-white font-semibold text-slate-900 disabled:opacity-30">
          Vazhdo
        </button>
      )}
    </div>
  )
}
