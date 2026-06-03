import { SignJWT, jwtVerify } from 'jose'

const secretKey = process.env.JWT_SECRET || "quicksolve-secret-jwt-key!@#"
const encodedKey = new TextEncoder().encode(secretKey)

// ============================================================
// JWT functions — Edge-safe (no Node.js modules used here)
// ============================================================

export async function encrypt(payload: any) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload
  } catch (error) {
    return null
  }
}

export async function createSession(userId: string, email: string, role: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
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
  } catch (error) {
    return null
  }
}
