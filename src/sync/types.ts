export type RecordType = 'budget' | 'category' | 'person' | 'expense' | 'split' | 'transfer' | 'adjustment' | 'recurring' | 'carry'

/** Një rekord në server. `data` mungon kur `deleted` (gur varri). */
export interface RemoteRecord {
  type: RecordType
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  updated_at?: string
  updated_by?: string | null
}

export interface Cursor {
  ts: string
  type: string
  id: string
}

/** Serveri, i abstraktuar që motori të testohet edhe me një server në memorie. */
export interface SyncRemote {
  push(records: RemoteRecord[]): Promise<void>
  /** Një faqe rekordesh pas kursorit, të renditura sipas (updated_at, type, id). */
  pull(after: Cursor | null, limit: number): Promise<RemoteRecord[]>
}

/** Identiteti i kësaj pajisjeje në familje + kursori i shkarkimit. Ruhet te settings['sync']. */
export interface SyncConfig {
  householdId: string
  householdName: string
  joinCode: string
  memberId: string
  memberName: string
  token: string
  role: 'owner' | 'member'
  /** Personi që përfaqëson këtë anëtar te të tjerët (të hyrat e "Unë"). */
  myPersonId: string
  cursor: Cursor | null
  lastSyncAt?: number
}

export const keyOf = (type: string, id: string) => `${type}:${id}`
