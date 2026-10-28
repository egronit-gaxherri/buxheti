import { b64ToBytes, bytesToB64 } from './b64'

/** PIN-i nuk ruhet kurrë; ruhet vetëm hash-i PBKDF2-SHA256 me kripë të rastësishme. */
export interface PinRecord {
  salt: string
  hash: string
  iterations: number
  /** Gjatësia e PIN-it, që tastiera ta pranojë vetë pa shtypur "OK". */
  length: number
}

const ITERATIONS = 150_000
export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin)

/**
 * Hash-i PBKDF2-SHA256 i kodit fillestar të pronarit.
 * Vetë kodi nuk ruhet askund në kodin burimor; pa këtë kod askush i huaj nuk mund të hyjë në aplikacion.
 */
export const OWNER_PIN: PinRecord = {
  salt: '2qGl0eDmuEDmU8C9qIMvCg==',
  hash: 'TVSp6jSWRQWq5/gyxEKJYwKR3CCY7ndnDu/eDAzARIo=',
  iterations: ITERATIONS,
  length: 6,
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('PIN-i duhet të ketë 4–6 shifra')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: bytesToB64(salt), hash: bytesToB64(await derive(pin, salt, ITERATIONS)), iterations: ITERATIONS, length: pin.length }
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const got = await derive(pin, b64ToBytes(rec.salt), rec.iterations)
  const want = b64ToBytes(rec.hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i] // krahasim në kohë konstante
  return diff === 0
}

/**
 * Bllokimi pas tentativave të gabuara: çdo 5 gabime radhazi → 30s, pastaj dyfishohet (max 15 min).
 * Kthen sa ms duhet pritur pas `fails` gabimeve (0 = s’ka bllokim).
 */
export function lockoutMs(fails: number): number {
  if (fails < 5 || fails % 5 !== 0) return 0
  return Math.min(30_000 * 2 ** (fails / 5 - 1), 15 * 60_000)
}
