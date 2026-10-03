import type { Category, DescriptionStat } from '../db/schema'

/** lowercase + pa shenja diakritike (ë→e, ç→c) që "Bukë" = "buke". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zgjedh kategorinë nga përshkrimi:
 * 1) përputhje e saktë në historik (ajo që ke zgjedhur herën e fundit),
 * 2) fjalë kyçe (një fjalë e përshkrimit fillon me fjalën kyçe),
 * 3) null.
 */
export function guessCategory(
  description: string,
  categories: Category[],
  history?: DescriptionStat,
): string | null {
  const norm = normalize(description)
  if (!norm) return null
  if (history && history.text === norm) return history.lastCategoryId
  const tokens = norm.split(' ')
  for (const c of categories) {
    for (const kw of c.keywords) {
      if (tokens.some((t) => t === kw || (kw.length >= 3 && t.startsWith(kw)))) return c.id
    }
  }
  return null
}

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Ushqim', icon: '🛒', keywords: ['buke', 'buk', 'ushqim', 'market', 'qumesht', 'mish', 'peshk', 'veze', 'djathe', 'fruta', 'perime', 'pije', 'spar', 'conad', 'viva'] },
  { name: 'Karburant', icon: '⛽', keywords: ['benzin', 'nafte', 'naft', 'karburant', 'gaz', 'diesel', 'pompa'] },
  { name: 'Fatura', icon: '🧾', keywords: ['fature', 'fatura', 'drite', 'rryme', 'uje', 'telefon', 'internet'] },
  { name: 'Qira', icon: '🏠', keywords: ['qira', 'kondominium', 'kredi'] },
  { name: 'Kafe & Restorant', icon: '☕', keywords: ['kafe', 'kafja', 'kafeja', 'espresso', 'restorant', 'pica', 'byrek', 'embelsire', 'akullore'] },
  { name: 'Transport', icon: '🚌', keywords: ['taksi', 'bus', 'autobus', 'parking', 'tarifa', 'autostrade', 'servis', 'goma'] },
  { name: 'Shëndet', icon: '💊', keywords: ['barnatore', 'ilac', 'mjek', 'dentist', 'vitamina', 'analiza'] },
  { name: 'Veshje', icon: '👕', keywords: ['veshje', 'kepuce', 'xhaket', 'pantallona', 'bluze'] },
  { name: 'Argëtim', icon: '🎬', keywords: ['kinema', 'loje', 'netflix', 'spotify', 'cinema', 'koncert', 'udhetim'] },
  { name: 'Dhurata & Familje', icon: '🎁', keywords: ['dhurate', 'dhurata', 'mami', 'babi', 'motra', 'vellai', 'ditelindje'] },
  { name: 'Tjetër', icon: '📦', keywords: [] },
]
export const FALLBACK_CATEGORY_NAME = 'Tjetër'
