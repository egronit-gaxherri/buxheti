import { describe, expect, it } from 'vitest'
import { isDuplicate, parseNotes } from './notesParser'

const T = '2026-10-03'
const simple = (text: string) => parseNotes(text, T).items.map((i) => [i.date, i.description, i.amount])

describe('parseNotes', () => {
  it('shembulli nga Apple Notes', () => {
    const r = parseNotes('Blerjet me datën 02.10.2026\nEtc junik -mami 20 euro\nBuk 3 euro', T)
    expect(r.items.map((i) => [i.date, i.description, i.amount, i.dateGuessed])).toEqual([
      ['2026-10-02', 'Etc junik -mami', 2000, false],
      ['2026-10-02', 'Buk', 300, false],
    ])
    expect(r.skipped).toEqual([])
  })
  it('njeh "1.5", "2,8 euro", "20euro", "€3", shuma pa euro', () => {
    expect(simple('Blerjet me datën 02.10.2026\nKafe 1.5\nQumesht 2,8 euro\nBuke 20euro\nUje €3\nMish 12')).toEqual([
      ['2026-10-02', 'Kafe', 150], ['2026-10-02', 'Qumesht', 280], ['2026-10-02', 'Buke', 2000],
      ['2026-10-02', 'Uje', 300], ['2026-10-02', 'Mish', 1200],
    ])
  })
  it('disa data: çdo titull vlen për rreshtat pas tij', () => {
    expect(simple('Blerjet me datën 01.10.2026\nBuk 3 euro\n\nBlerjet me datën 02.10.2026\nBenzin 20 euro')).toEqual([
      ['2026-10-01', 'Buk', 300], ['2026-10-02', 'Benzin', 2000],
    ])
  })
  it('pa titull → data e paracaktuar e shënuar si e hamendësuar', () => {
    const r = parseNotes('Buk 3', T)
    expect(r.items[0]).toMatchObject({ date: T, dateGuessed: true })
  })
  it('numrat në përshkrim nuk ngatërrohen me shumën', () => {
    expect(simple('Pampers 2 pako 12 euro\nKafe 2 euro 1.5')).toEqual([
      ['2026-10-03', 'Pampers 2 pako', 1200], ['2026-10-03', 'Kafe 1.5', 200],
    ])
  })
  it('data në të njëjtin rresht me shpenzimin, vit 2-shifror, shenja listash', () => {
    expect(simple('02/10/26 - Buk 3 euro\n• Qumesht 1,2')).toEqual([
      ['2026-10-02', 'Buk', 300], ['2026-10-02', 'Qumesht', 120],
    ])
  })
  it('anashkalon totalet dhe rreshtat pa shumë; data e pavlefshme nuk merret', () => {
    const r = parseNotes('Shënime\nBlerjet 31.02.2026\nBuk 3 euro\nTotali 3 euro', T)
    expect(r.items).toHaveLength(1)
    expect(r.items[0].date).toBe(T)
    expect(r.skipped.map((s) => s.reason)).toEqual(['no-amount', 'no-amount', 'total'])
  })
  it('dublikatet', () => {
    const ex = [{ date: '2026-10-02', amount: 300, description: 'Bukë' }]
    expect(isDuplicate({ date: '2026-10-02', amount: 300, description: 'buke' }, ex)).toBe(true)
    expect(isDuplicate({ date: '2026-10-03', amount: 300, description: 'buke' }, ex)).toBe(false)
  })
})
