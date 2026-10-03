import { db } from '../db/db'
import { b64ToBytes, bytesToB64 } from './b64'

export const BACKUP_APP = 'budgeti'
export const BACKUP_VERSION = 2 // v2: personat

/**
 * Tabelat që hyjnë në backup. `settings` mbetet jashtë qëllimisht: PIN-i dhe Face ID
 * janë të lidhura me pajisjen dhe s'duhet të udhëtojnë në një skedar.
 */
export const BACKUP_TABLES = [
  'budgets', 'categories', 'incomes', 'incomeSplits', 'expenses', 'transfers',
  'adjustments', 'debts', 'recurring', 'limits', 'months', 'descriptions', 'people',
] as const
type TableName = (typeof BACKUP_TABLES)[number]

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

interface EncodedBlob {
  __blob: string // data URL
}

async function encodeBlob(b: Blob): Promise<EncodedBlob> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  return { __blob: `data:${b.type || 'application/octet-stream'};base64,${bytesToB64(bytes)}` }
}

function decodeBlob(e: EncodedBlob): Blob {
  const m = e.__blob.match(/^data:([^;]*);base64,(.*)$/s)
  if (!m) throw new Error('Foto e dëmtuar në backup')
  return new Blob([b64ToBytes(m[2])], { type: m[1] })
}

const isEncodedBlob = (v: unknown): v is EncodedBlob => typeof v === 'object' && v !== null && typeof (v as EncodedBlob).__blob === 'string'

export async function exportBackup(): Promise<BackupFile> {
  const tables = {} as Record<TableName, unknown[]>
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) tables[t] = await db.table(t).toArray()
  })
  // Fotot e faturave (Blob) → data URL, që skedari të jetë JSON i pastër
  tables.expenses = await Promise.all(
    (tables.expenses as Record<string, unknown>[]).map(async (e) => (e.receipt instanceof Blob ? { ...e, receipt: await encodeBlob(e.receipt) } : e)),
  )
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Kontrollon skedarin para se të prekë bazën. Hedh gabim me mesazh në shqip. */
export function validateBackup(json: unknown): BackupFile {
  if (!isObj(json) || json.app !== BACKUP_APP) throw new Error('Ky skedar nuk është backup i Buxhetit')
  if (typeof json.version !== 'number' || json.version > BACKUP_VERSION) throw new Error('Backup nga një version më i ri i aplikacionit')
  if (!isObj(json.tables)) throw new Error('Backup i dëmtuar: mungojnë tabelat')
  const tables = json.tables
  for (const t of BACKUP_TABLES) {
    if (tables[t] === undefined) tables[t] = []
    if (!Array.isArray(tables[t])) throw new Error(`Backup i dëmtuar: "${t}" nuk është listë`)
  }
  const budgets = tables.budgets as unknown[]
  if (budgets.length === 0) throw new Error('Backup pa asnjë buxhet')
  for (const b of budgets) if (!isObj(b) || typeof b.id !== 'string' || typeof b.name !== 'string') throw new Error('Backup i dëmtuar: buxhet i pavlefshëm')
  for (const e of tables.expenses as unknown[]) {
    if (!isObj(e) || typeof e.id !== 'string' || !Number.isInteger(e.amount) || typeof e.budgetId !== 'string' || typeof e.date !== 'string' || !DATE.test(e.date))
      throw new Error('Backup i dëmtuar: shpenzim i pavlefshëm')
  }
  return json as unknown as BackupFile
}

/** Zëvendëson GJITHË të dhënat me ato të backup-it, në një transaksion të vetëm. */
export async function importBackup(json: unknown): Promise<Record<TableName, number>> {
  const file = validateBackup(json)
  const expenses = (file.tables.expenses as Record<string, unknown>[]).map((e) => (isEncodedBlob(e.receipt) ? { ...e, receipt: decodeBlob(e.receipt) } : e))
  const counts = {} as Record<TableName, number>
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows =
        t === 'expenses' ? expenses
        : t === 'debts' ? (file.tables.debts as Record<string, unknown>[]).map((d) => ({ payments: [], ...d })) // backup-e para v3
        : file.tables[t]
      await db.table(t).clear()
      await db.table(t).bulkAdd(rows)
      counts[t] = rows.length
    }
  })
  return counts
}
