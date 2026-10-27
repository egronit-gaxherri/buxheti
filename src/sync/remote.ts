import type { Cursor, RemoteRecord, SyncRemote } from './types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const syncAvailable = () => !!(SUPABASE_URL && SUPABASE_KEY)

export class RemoteError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

const MESSAGES: Record<string, string> = {
  invalid_token: 'Kjo pajisje nuk është më anëtare e familjes.',
  invalid_code: 'Kodi i ftesës është i gabuar.',
  forbidden: 'Vetëm krijuesi i familjes mund ta bëjë këtë.',
}

/** Thërret një funksion RPC të Supabase me fetch (pa librari). */
export async function rpc<T>(fn: string, args: Record<string, unknown>, opts: { url?: string; key?: string } = {}): Promise<T> {
  const url = opts.url ?? SUPABASE_URL
  const key = opts.key ?? SUPABASE_KEY
  if (!url || !key) throw new RemoteError('not_configured', 'Sinkronizimi nuk është konfiguruar.')
  let res: Response
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
  } catch {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new RemoteError(
      'offline',
      isOffline ? 'Pa lidhje me internetin.' : 'Serveri i sinkronizimit (Supabase) nuk u arrit. Kontrollo lidhjen ose nëse projekti është aktiv në Supabase.',
    )
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const m = (body?.message as string) ?? `HTTP ${res.status}`
    throw new RemoteError(m, MESSAGES[m] ?? `Gabim nga serveri: ${m}`)
  }
  return body as T
}

export interface HouseholdIdentity {
  household_id: string
  household_name: string
  join_code: string
  member_id: string
  member_token: string
}

export interface HouseholdInfo {
  household_id: string
  household_name: string
  join_code: string
  member_id: string
  role: 'owner' | 'member'
  members: { id: string; display_name: string; role: 'owner' | 'member'; joined_at: string; last_seen_at: string | null }[]
}

export class SupabaseRemote implements SyncRemote {
  constructor(private token: string, private opts: { url?: string; key?: string } = {}) {}
  async push(records: RemoteRecord[]) {
    await rpc('sync_push', { p_token: this.token, p_records: records.map(({ type, id, data, deleted }) => ({ type, id, data, deleted })) }, this.opts)
  }
  async pull(after: Cursor | null, limit: number) {
    return rpc<RemoteRecord[]>('sync_pull', { p_token: this.token, p_since: after?.ts ?? null, p_after_type: after?.type ?? '', p_after_id: after?.id ?? '', p_limit: limit }, this.opts)
  }
}

/** Server në memorie për testet: sillet si sync_push/sync_pull. */
export class MemoryRemote implements SyncRemote {
  rows = new Map<string, RemoteRecord & { updated_at: string }>()
  private clock = Date.UTC(2026, 0, 1)
  async push(records: RemoteRecord[]) {
    for (const r of records) {
      this.clock += 1
      const row = { type: r.type, id: r.id, data: r.deleted ? null : structuredClone(r.data), deleted: r.deleted, updated_at: new Date(this.clock).toISOString() }
      this.rows.set(`${r.type}:${r.id}`, row)
    }
  }
  async pull(after: Cursor | null, limit: number) {
    const k = (r: { updated_at: string; type: string; id: string }) => `${r.updated_at}|${r.type}|${r.id}`
    const from = after ? k({ updated_at: after.ts, type: after.type, id: after.id }) : ''
    return [...this.rows.values()].filter((r) => k(r) > from).sort((a, b) => (k(a) < k(b) ? -1 : 1)).slice(0, limit).map((r) => structuredClone(r))
  }
}
