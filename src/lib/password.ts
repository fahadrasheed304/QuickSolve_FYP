import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

const HASH_ALGORITHM = 'sha256'
const KEY_LENGTH = 64
const ITERATIONS = 310_000
const PREFIX = 'pbkdf2_sha256'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM).toString('hex')

  return `${PREFIX}$${ITERATIONS}$${salt}$${hash}`
}

export function isPasswordHash(value: string) {
  return value.startsWith(`${PREFIX}$`)
}

export function verifyPassword(password: string, storedPassword: string) {
  if (!storedPassword) return false

  if (!isPasswordHash(storedPassword)) {
    return password === storedPassword
  }

  const [, iterationsRaw, salt, storedHash] = storedPassword.split('$')
  const iterations = Number(iterationsRaw)

  if (!iterations || !salt || !storedHash) return false

  const candidateHash = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, HASH_ALGORITHM)
  const storedBuffer = Buffer.from(storedHash, 'hex')

  return storedBuffer.length === candidateHash.length && timingSafeEqual(storedBuffer, candidateHash)
}