import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export const getSetting = async <T>(key: string): Promise<T | undefined> => (await db.settings.get(key))?.value as T | undefined
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })
export const deleteSetting = (key: string) => db.settings.delete(key)

/** `undefined` = duke u ngarkuar, `null` = s’ekziston. */
export function useSetting<T>(key: string): T | null | undefined {
  return useLiveQuery(async () => ((await db.settings.get(key))?.value as T | undefined) ?? null, [key])
}

export const KEYS = { pin: 'pin', pinFails: 'pinFails', biometric: 'biometric', lastBackup: 'lastBackup' } as const
export interface PinFails {
  count: number
  lockedUntil: number
}
