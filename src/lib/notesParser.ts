import { normalize } from './categorize'
import { parseAmount } from './money'
import { toDateStr } from './dates'

export interface ParsedItem {
  line: number
  date: string
  /** true kur rreshti s'kishte datë mbi të dhe u përdor data e paracaktuar */
  dateGuessed: boolean
  description: string
  amount: number // cent
}

export interface SkippedLine {
  line: number
  raw: string
  reason: 'no-amount' | 'total'
}

export interface ParseResult {
  items: ParsedItem[]
  skipped: SkippedLine[]
}

const DATE_RE = /(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/
const NUM = String.raw`\d[\d.,]*`
const MARKED_AFTER = new RegExp(String.raw`(${NUM})\s*(?:€|euro\b|eur\b)`, 'gi')
const MARKED_BEFORE = new RegExp(String.raw`€\s*(${NUM})`, 'g')
const ANY_NUM = new RegExp(NUM, 'g')
const TOTAL_RE = /^(total|totali|gjithsej|shuma|sum)\b/

/** Gjen një datë në rresht. `date` është null kur formati duket si datë por është e pavlefshme (31.02.2026). */
function matchDate(s: string): { date: string | null; text: string } | null {
  const m = s.match(DATE_RE)
  if (!m) return null
  const [d, mo] = [Number(m[1]), Number(m[2])]
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { date: null, text: s.replace(m[0], ' ') }
  return { date: toDateStr(dt), text: s.replace(m[0], ' ') }
}

/** Gjen shumën në një rresht: e fundit me "euro/€", përndryshe numri i fundit. */
function findAmount(s: string): { cents: number; start: number; end: number } | null {
  const hits: { raw: string; start: number; end: number }[] = []
  for (const re of [MARKED_AFTER, MARKED_BEFORE]) {
    re.lastIndex = 0
    for (const m of s.matchAll(re)) hits.push({ raw: m[1], start: m.index!, end: m.index! + m[0].length })
  }
  if (hits.length === 0) {
    for (const m of s.matchAll(ANY_NUM)) hits.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length })
  }
  const last = hits.sort((a, b) => a.start - b.start).at(-1)
  if (!last) return null
  const cents = parseAmount(last.raw)
  return cents == null || cents <= 0 ? null : { cents, start: last.start, end: last.end }
}

const cleanDescription = (s: string) => s.replace(/^[\s\-–•*·:]+/, '').replace(/[\s\-–•*·:,.=]+$/, '').replace(/\s+/g, ' ').trim()

/**
 * Kthen tekstin e ngjitur nga Apple Notes në shpenzime.
 * Një rresht me datë (p.sh. "Blerjet me datën 02.10.2026") vlen për rreshtat pasardhës.
 */
export function parseNotes(text: string, defaultDate: string): ParseResult {
  const items: ParsedItem[] = []
  const skipped: SkippedLine[] = []
  let date = defaultDate
  let guessed = true

  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim()
    if (!line) return
    const d = matchDate(line)
    if (d) {
      if (d.date) {
        date = d.date
        guessed = false
      }
      line = d.text.trim()
    }
    const amount = findAmount(line)
    if (!amount) {
      // rresht-titull me datë (pa shumë) nuk është "i anashkaluar"
      if (!d?.date) skipped.push({ line: i + 1, raw, reason: 'no-amount' })
      return
    }
    if (TOTAL_RE.test(normalize(line))) {
      skipped.push({ line: i + 1, raw, reason: 'total' })
      return
    }
    items.push({
      line: i + 1,
      date,
      dateGuessed: guessed,
      description: cleanDescription(line.slice(0, amount.start) + ' ' + line.slice(amount.end)),
      amount: amount.cents,
    })
  })
  return { items, skipped }
}

export interface ExistingLike {
  date: string
  amount: number
  description: string
}

/** A ekziston tashmë një shpenzim me të njëjtën datë, shumë dhe përshkrim? */
export function isDuplicate(item: { date: string; amount: number; description: string }, existing: ExistingLike[]): boolean {
  const d = normalize(item.description)
  return existing.some((e) => e.date === item.date && e.amount === item.amount && normalize(e.description) === d)
}
