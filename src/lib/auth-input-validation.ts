import { COUNTRY_PHONE_OPTIONS } from '@/lib/phone'

const EMAIL_PATTERN = /^(?=.{1,254}$)(?=.{1,64}@)[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return EMAIL_PATTERN.test(email) ? email : null
}

export function isStrongPassword(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 128
    && /[A-Za-z]/.test(value)
    && /[\d\p{P}\p{S}]/u.test(value)
}

export function normalizeFullName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length >= 2 && name.length <= 80
    && /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(name)
    ? name
    : null
}

export function isValidSignupPhone(value: unknown): value is string {
  return typeof value === 'string' && COUNTRY_PHONE_OPTIONS.some((option) => {
    if (!value.startsWith(option.code)) return false
    const digits = value.slice(option.code.length)
    return new RegExp(`^\\d{${option.maxDigits}}$`).test(digits)
      && (option.code !== '+92' || digits.startsWith('3'))
  })
}

export const PASSWORD_REQUIREMENTS = 'Password must be 8 to 128 characters long and include at least one letter and one number or symbol.'

