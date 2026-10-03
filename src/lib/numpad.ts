/** Logjika e tastierës numerike: mban shumën si tekst ("12,5"), max 2 decimale. */
export function pressKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1)
  if (key === ',') {
    if (current.includes(',')) return current
    return (current === '' ? '0' : current) + ','
  }
  // shifër
  if (current === '0') return key // pa zero në fillim
  const [int, frac] = current.split(',')
  if (frac !== undefined && frac.length >= 2) return current
  if (frac === undefined && int.length >= 7) return current
  return current + key
}

/** "12,5" → 1250 cent */
export function numpadToCents(text: string): number {
  if (!text) return 0
  const [int, frac = ''] = text.split(',')
  return Number(int || '0') * 100 + Number((frac + '00').slice(0, 2))
}
