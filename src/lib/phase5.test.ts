import { describe, expect, it, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPinRecord, isValidPin, lockoutMs, verifyPin } from './pin'
import { encodeWinAnsi, buildPdf } from './pdf'
import { monthCsv } from './csv'
import { monthReportPdf } from './report'
import { yearTrend, monthTotals } from './archive'
import { exportBackup, importBackup, validateBackup } from './backup'
import { db } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { addExpense, addIncome, addTransfer, closeMonth, refreshClosedMonthCarry, remainingFor, reopenMonth } from '../db/actions'
import { loadMonthData, monthsWithData } from '../db/queries'
import type { MonthData } from './calc'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedIfEmpty()
})

describe('PIN', () => {
  it('hash + verifikim, pa e ruajtur PIN-in', async () => {
    const rec = await createPinRecord('4821')
    expect(JSON.stringify(rec)).not.toContain('4821')
    expect(await verifyPin('4821', rec)).toBe(true)
    expect(await verifyPin('4822', rec)).toBe(false)
    const rec2 = await createPinRecord('4821')
    expect(rec2.salt).not.toBe(rec.salt) // kripë e re çdo herë
  })
  it('validimi dhe bllokimi', async () => {
    expect([isValidPin('123'), isValidPin('1234'), isValidPin('123456'), isValidPin('12a4')]).toEqual([false, true, true, false])
    await expect(createPinRecord('12')).rejects.toThrow()
    expect([lockoutMs(4), lockoutMs(5), lockoutMs(6), lockoutMs(10), lockoutMs(50)]).toEqual([0, 30_000, 0, 60_000, 15 * 60_000])
  })
})

const sample = (): MonthData => ({
  monthKey: '2026-10',
  budgets: [{ id: 'h', name: 'Shtëpi', color: '', order: 0 }, { id: 'p', name: 'Personal', color: '', order: 1 }],
  incomeSplits: [{ id: 's', incomeId: 'i', budgetId: 'h', monthKey: '2026-10', amount: 30000 }],
  expenses: [
    { id: 'e1', monthKey: '2026-10', budgetId: 'h', categoryId: 'c', amount: 2000, description: 'Etc junik -mami', date: '2026-10-02', createdAt: 1 },
    { id: 'e2', monthKey: '2026-10', budgetId: 'h', categoryId: 'c', amount: 300, description: '=SUM(A1)', note: 'me "thonjëza"; dhe pikëpresje', date: '2026-10-02', createdAt: 2 },
  ],
  transfers: [{ id: 't', monthKey: '2026-10', fromBudgetId: 'p', toBudgetId: 'h', amount: 2000, date: '2026-10-03', createdAt: 0 }],
  adjustments: [{ id: 'a', monthKey: '2026-10', budgetId: 'h', amount: -450, date: '2026-10-04', createdAt: 0, note: 'Korrigjim' }],
  carryIn: {},
})
const incomes = [{ id: 'i', monthKey: '2026-10', source: 'Edi', amount: 30000, date: '2026-10-01', createdAt: 0 }]
const cats = [{ id: 'c', name: 'Ushqim', icon: '', keywords: [] }]

describe('CSV', () => {
  it('ndarës ;, presje dhjetore, BOM, thonjëza dhe mbrojtje nga formulat', () => {
    const csv = monthCsv(sample(), incomes, sample().budgets, cats)
    expect(csv.startsWith('﻿Data;Lloji;Buxheti')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines[1]).toBe('01.10.2026;Të hyra;Shtëpi;;Edi;300,00;')
    expect(lines[2]).toBe('02.10.2026;Shpenzim;Shtëpi;Ushqim;Etc junik -mami;-20,00;')
    expect(lines[3]).toBe(`02.10.2026;Shpenzim;Shtëpi;Ushqim;'=SUM(A1);-3,00;"me ""thonjëza""; dhe pikëpresje"`)
    expect(lines[4]).toBe('03.10.2026;Transferim;Personal → Shtëpi;;;20,00;')
    expect(lines[5]).toBe('04.10.2026;Korrigjim;Shtëpi;;;-4,50;Korrigjim')
  })
})

describe('PDF', () => {
  it('kodim WinAnsi për shqipen dhe €', () => {
    expect(encodeWinAnsi('ë ç € (x) −5')).toBe('\xeb \xe7 \x80 \\(x\\) -5')
  })
  it('struktura e vlefshme: xref tregon saktë te objektet', () => {
    const bytes = buildPdf([[{ x: 40, y: 800, text: 'Përshëndetje' }]])
    const s = String.fromCharCode(...bytes)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    const xrefAt = Number(s.match(/startxref\n(\d+)/)![1])
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const offsets = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    offsets.forEach((o, i) => expect(s.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })
  it('raporti lexohet nga pdftotext (nëse është i instaluar)', () => {
    const bytes = monthReportPdf(sample(), incomes, sample().budgets, cats, new Date(2026, 9, 3))
    const bin = ['/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext', '/usr/bin/pdftotext'].find(existsSync)
    if (!bin) return
    const dir = mkdtempSync(join(tmpdir(), 'budgeti-'))
    writeFileSync(join(dir, 'r.pdf'), bytes)
    const txt = execFileSync(bin, ['-layout', join(dir, 'r.pdf'), '-'], { encoding: 'utf8' })
    for (const want of ['Raporti i muajit', 'Tetor 2026', 'Blerjet me datën 02.10.2026', 'Etc junik -mami', '300,00 €', 'Personal -> Shtëpi', 'Kursim'])
      expect(txt).toContain(want)
  })
  it('faqe të shumta kur ka shumë shpenzime', () => {
    const d = sample()
    d.expenses = Array.from({ length: 150 }, (_, i) => ({ ...d.expenses[0], id: String(i), date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }))
    const s = String.fromCharCode(...monthReportPdf(d, incomes, d.budgets, cats))
    expect(Number(s.match(/\/Count (\d+)/)![1])).toBeGreaterThan(2)
  })
})

describe('arkivi', () => {
  it('totalet dhe tendenca vjetore', () => {
    expect(monthTotals(sample())).toMatchObject({ income: 30000, spent: 2300, saved: 27700 })
    const t = yearTrend(2026, sample().incomeSplits, sample().expenses)
    expect(t).toHaveLength(12)
    expect(t[9]).toMatchObject({ monthKey: '2026-10', income: 30000, spent: 2300 })
    expect(t[0]).toMatchObject({ income: 0, spent: 0 })
  })
  it('mbyllja barton mbetjen; rihapja e heq; rimbyllja nuk e dyfishon', async () => {
    const [h, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'x', amount: 30000, date: '2026-09-01', splits: [{ budgetId: h.id, amount: 20000 }, { budgetId: p.id, amount: 10000 }] })
    await addExpense({ amount: 5000, description: 'a', budgetId: h.id, categoryId: 'x', date: '2026-09-10' })
    await closeMonth('2026-09', { [h.id]: 15000 }) // vetëm Shtëpi bart
    expect(await remainingFor(h.id, '2026-10')).toBe(15000)
    expect(await remainingFor(p.id, '2026-10')).toBe(0)
    expect((await db.months.get('2026-09'))?.closed).toBe(true)
    // Ndryshim pas mbylljes → refreshClosedMonthCarry përditëson bartjen e Shtëpisë
    await addExpense({ amount: 2000, description: 'b', budgetId: h.id, categoryId: 'x', date: '2026-09-12' })
    await refreshClosedMonthCarry('2026-09')
    expect(await remainingFor(h.id, '2026-10')).toBe(13000)
    expect(await remainingFor(p.id, '2026-10')).toBe(0)
    await closeMonth('2026-09', { [h.id]: 13000, [p.id]: 10000 })
    expect(await remainingFor(h.id, '2026-10')).toBe(13000)
    expect(await remainingFor(p.id, '2026-10')).toBe(10000)
    await reopenMonth('2026-09')
    expect(await remainingFor(h.id, '2026-10')).toBe(0)
    expect((await db.months.get('2026-09'))?.closed).toBe(false)
    expect(await monthsWithData()).toEqual(['2026-09'])
  })
})

describe('backup', () => {
  it('eksport → fshi → import kthen gjithçka, edhe foton e faturës', async () => {
    const [h, p] = await db.budgets.orderBy('order').toArray()
    await addIncome({ source: 'Rrogë', amount: 32000, date: '2026-10-01', splits: [{ budgetId: h.id, amount: 10000 }, { budgetId: p.id, amount: 22000 }] })
    await addExpense({ amount: 1250, description: 'Benzin', budgetId: h.id, categoryId: 'x', date: '2026-10-02', receipt: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }) })
    await addTransfer({ fromBudgetId: p.id, toBudgetId: h.id, amount: 2000, date: '2026-10-02' })
    await db.settings.put({ key: 'pin', value: { secret: true } })

    const file = JSON.parse(JSON.stringify(await exportBackup())) // si të kalonte nëpër skedar
    expect(file.tables.settings).toBeUndefined()
    expect(file.tables.expenses[0].receipt.__blob).toMatch(/^data:image\/jpeg;base64,/)

    await Promise.all(db.tables.filter((t) => t.name !== 'settings').map((t) => t.clear()))
    const counts = await importBackup(file)
    expect(counts).toMatchObject({ budgets: 2, expenses: 1, incomes: 1, incomeSplits: 2, transfers: 1 })
    expect(await remainingFor(h.id, '2026-10')).toBe(10000 - 1250 + 2000)
    const e = (await db.expenses.toArray())[0]
    expect(e.receipt).toBeInstanceOf(Blob)
    expect([...new Uint8Array(await e.receipt!.arrayBuffer())]).toEqual([1, 2, 3, 250])
    expect(await db.settings.get('pin')).toBeDefined() // PIN-i i pajisjes nuk preket
    expect((await loadMonthData('2026-10')).expenses).toHaveLength(1)
  })
  it('refuzon skedarë të gabuar pa prekur të dhënat', async () => {
    const before = await db.budgets.count()
    expect(() => validateBackup({ foo: 1 })).toThrow('nuk është backup')
    expect(() => validateBackup({ app: 'budgeti', version: 99, tables: {} })).toThrow('version më i ri')
    await expect(importBackup({ app: 'budgeti', version: 1, tables: { budgets: [{ id: 'x', name: 'X' }], expenses: [{ id: 'e', amount: 1.5, budgetId: 'x', date: '2026-10-01' }] } })).rejects.toThrow('shpenzim i pavlefshëm')
    expect(await db.budgets.count()).toBe(before)
  })
})
