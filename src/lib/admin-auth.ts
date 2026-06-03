import { timingSafeEqual } from 'crypto'

export const ADMIN_EMAIL = 'quicksolve.officials@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Abd567@?'

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const isAdminEmail = (email: string) => email.toLowerCase().trim() === ADMIN_EMAIL

export const verifyAdminCredentials = (email: string, password: string) => (
  isAdminEmail(email) && safeEqual(password, ADMIN_PASSWORD)
)
