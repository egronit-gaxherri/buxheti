import { describe, expect, it } from 'vitest'
import { formatEUR, parseAmount } from './money'
import { daysRemaining, formatDateSQ, formatMonthSQ, shiftMonth } from './dates'
import { guessCategory, normalize, DEFAULT_CATEGORIES } from './categorize'
import { numpadToCents, pressKey } from './numpad'
import { summarizeBudget, type MonthData } from './calc'

describe('money', () => {
  it('formaton cent në shqip', () => {
    expect(formatEUR(22530)).toBe('225,30 €')
    expect(formatEUR(-500)).toBe('−5,00 €')
    expect(formatEUR(123456789)).toBe('1.234.567,89 €')
  })
  it.each([
    ['20 euro', 2000], ['1.5', 150], ['2,8 euro', 280], ['€3', 300],
    ['Buk 3 euro', 300], ['1.250,50', 125050], ['1.250', 125000], ['0.125', 13],
  ])('parson "%s"', (s, cents) => expect(parseAmount(s)).toBe(cents))
  it('kthen null pa numër', () => expect(parseAmount('Buk')).toBeNull())
})

describe('dates', () => {
  it('formaton', () => {
    expect(formatDateSQ('2026-10-02')).toBe('02.10.2026')
    expect(formatMonthSQ('2026-10')).toBe('Tetor 2026')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it('ditët e mbetura përfshijnë ditën e sotme', () => {
    expect(daysRemaining('2026-10', '2026-10-03')).toBe(29)
    expect(daysRemaining('2026-10', '2026-10-31')).toBe(1)
    expect(daysRemaining('2026-09', '2026-10-03')).toBe(0)
    expect(daysRemaining('2026-11', '2026-10-03')).toBe(30)
  })
})

describe('categorize', () => {
  const cats = DEFAULT_CATEGORIES.map((c, i) => ({ id: String(i), ...c }))
  const name = (id: string | null) => cats.find((c) => c.id === id)?.name
  it('normalizon', () => expect(normalize('Bukë  e Çmuar!')).toBe('buke e cmuar'))
  it.each([
    ['Benzin', 'Karburant'], ['Buk', 'Ushqim'], ['Bukë', 'Ushqim'],
    ['Kafe me Edin', 'Kafe & Restorant'], ['Barnatore', 'Shëndet'], ['Fatura e dritës', 'Fatura'],
  ])('"%s" → %s', (d, c) => expect(name(guessCategory(d, cats))).toBe(c))
  it('historiku ka përparësi', () => {
    const h = { text: 'benzin', display: 'Benzin', count: 3, lastCategoryId: '9', lastBudgetId: 'x', lastUsed: 0 }
    expect(guessCategory('Benzin', cats, h)).toBe('9')
  })
  it('null kur s’njeh', () => expect(guessCategory('Etc junik', cats)).toBeNull())
})

describe('numpad', () => {
  const type = (keys: string) => [...keys].reduce(pressKey, '')
  it('ndërton shumën', () => {
    expect(type('1,5')).toBe('1,5')
    expect(type(',5')).toBe('0,5')
    expect(type('12,345')).toBe('12,34')
    expect(type('007')).toBe('7')
    expect(type('12⌫')).toBe('1')
  })
  it('në cent', () => {
    expect(numpadToCents('12,5')).toBe(1250)
    expect(numpadToCents('0,05')).toBe(5)
    expect(numpadToCents('')).toBe(0)
  })
})

describe('calc', () => {
  const base: MonthData = {
    monthKey: '2026-10',
    budgets: [{ id: 'h', name: 'Shtëpi', color: '', order: 0 }],
    incomeSplits: [{ id: '1', incomeId: 'i', budgetId: 'h', monthKey: '2026-10', amount: 40000 }],
    expenses: [{ id: 'e', monthKey: '2026-10', budgetId: 'h', categoryId: 'c', amount: 17470, description: '', date: '2026-10-02', createdAt: 0 }],
    transfers: [{ id: 't', monthKey: '2026-10', fromBudgetId: 'p', toBudgetId: 'h', amount: 2000, date: '2026-10-02', createdAt: 0 }],
    adjustments: [],
    carryIn: {},
  }
  it('mbetja = të hyra + transferime − shpenzime', () => {
    const s = summarizeBudget(base, 'h', '2026-10-03')
    expect(s.total).toBe(42000)
    expect(s.remaining).toBe(24530)
    expect(s.perDay).toBe(Math.floor(24530 / 29))
    expect(s.low).toBe(false)
  })
  it('kuqet nën 15%', () => {
    const d = { ...base, expenses: [{ ...base.expenses[0], amount: 37000 }] }
    expect(summarizeBudget(d, 'h', '2026-10-03').low).toBe(true)
  })
  it('korrigjimi dhe bartja hyjnë në mbetje', () => {
    const d = { ...base, carryIn: { h: 1000 }, adjustments: [{ id: 'a', monthKey: '2026-10', budgetId: 'h', amount: -500, date: '', createdAt: 0 }] }
    expect(summarizeBudget(d, 'h', '2026-10-03').remaining).toBe(24530 + 1000 - 500)
  })
})
