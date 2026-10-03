import { b64urlToBytes, bytesToB64url } from './b64'

/**
 * Face ID / Touch ID përmes WebAuthn (autentifikues i platformës).
 * Pa server, kjo është portë lokale: konfirmon që pronari i pajisjes u verifikua biometrikisht
 * (flamuri UV), por nuk enkripton të dhënat në IndexedDB.
 */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export async function registerBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Buxheti', id: location.hostname },
      user: { id: random(16), name: 'buxheti', displayName: 'Buxheti' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Regjistrimi i Face ID u anulua')
  return bytesToB64url(new Uint8Array(cred.rawId))
}

/** true vetëm nëse autentifikuesi raporton që përdoruesi u verifikua (flamuri UV në authenticatorData). */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: b64urlToBytes(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    const authData = new Uint8Array((cred.response as AuthenticatorAssertionResponse).authenticatorData)
    return (authData[32] & 0x04) !== 0
  } catch {
    return false
  }
}
