import { pressKey } from '../lib/numpad'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫']

export function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4">
      {KEYS.map((k) => (
        <button
          key={k}
          onClick={() => {
            navigator.vibrate?.(8)
            onChange(pressKey(value, k))
          }}
          className="h-14 rounded-2xl bg-surface-2 text-2xl font-medium active:bg-line"
          aria-label={k === '⌫' ? 'Fshi' : k}
        >
          {k}
        </button>
      ))}
    </div>
  )
}
