/** Shuma në cent → "225,30 €" (formati shqip). */
export function formatEUR(cents: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = cents < 0 ? '−' : opts.sign && cents > 0 ? '+' : ''
  return `${sign}${grouped},${frac} €`
}

/** Si formatEUR, por pa pjesën dhjetore kur është e plotë (225 €). */
export function formatEURShort(cents: number): string {
  return cents % 100 === 0 ? formatEUR(cents).replace(',00', '') : formatEUR(cents)
}

/**
 * Parson një shumë të shkruar nga njeriu në cent.
 * Pranon: "20", "20 euro", "1.5", "2,8 euro", "1.250,50", "€3".
 * Kthen null nëse nuk gjen numër.
 */
export function parseAmount(input: string): number | null {
  const m = input.replace(/€|euro|eur/gi, ' ').match(/\d[\d.,]*/)
  if (!m) return null
  let s = m[0].replace(/[.,]+$/, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const sep = Math.max(lastDot, lastComma)
  if (sep === -1) return Math.round(Number(s) * 100)
  const decimals = s.length - sep - 1
  // "1.250" ose "1,250" me 3 shifra pas ndarësit = mijëra; përndryshe dhjetore
  const mixed = lastDot !== -1 && lastComma !== -1
  const isThousands = decimals === 3 && !mixed && !/^0[.,]/.test(s)
  if (isThousands) return Math.round(Number(s.replace(/[.,]/g, '')) * 100)
  const intPart = s.slice(0, sep).replace(/[.,]/g, '')
  const fracPart = s.slice(sep + 1)
  const n = Number(`${intPart || '0'}.${fracPart}`)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
