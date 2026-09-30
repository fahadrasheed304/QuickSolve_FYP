import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { assertAccountAccess } from './account-access'

const secretKey = process.env.JWT_SECRET
if (!secretKey) throw new Error("JWT_SECRET must be configured")
const encodedKey = new TextEncoder().encode(secretKey)

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

// ============================================================
// JWT functions — Edge-safe (no Node.js modules used here)
// ============================================================

export async function encrypt(payload: JWTPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
      // Also cap existing seven-day tokens by their original issue time.
      maxTokenAge: SESSION_MAX_AGE_SECONDS,
    })
    if (typeof payload.email !== 'string') return null
    await assertAccountAccess(payload.email)
    return payload
  } catch {
    return null
  }
}

export async function createSession(userId: string, email: string, role: string) {
  await assertAccountAccess(email)
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  const session = await encrypt({ userId, email, role, expiresAt })
  return { session, expiresAt }
}

export async function createResetToken(email: string) {
  return new SignJWT({ email, purpose: 'reset_password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(encodedKey)
}

export async function verifyResetToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, encodedKey)
    if (payload.purpose !== 'reset_password') return null
    return payload.email as string
  } catch {
    return null
  }
}
