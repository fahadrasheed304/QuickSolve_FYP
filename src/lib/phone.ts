export const COUNTRY_PHONE_OPTIONS = [
  { code: '+92', flag: '\uD83C\uDDF5\uD83C\uDDF0', label: 'Pakistan', maxDigits: 10 },
  { code: '+1', flag: '\uD83C\uDDFA\uD83C\uDDF8', label: 'United States', maxDigits: 10 },
  { code: '+44', flag: '\uD83C\uDDEC\uD83C\uDDE7', label: 'United Kingdom', maxDigits: 10 },
  { code: '+971', flag: '\uD83C\uDDE6\uD83C\uDDEA', label: 'United Arab Emirates', maxDigits: 9 },
  { code: '+966', flag: '\uD83C\uDDF8\uD83C\uDDE6', label: 'Saudi Arabia', maxDigits: 9 },
  { code: '+61', flag: '\uD83C\uDDE6\uD83C\uDDFA', label: 'Australia', maxDigits: 9 },
]

export const getCountryPhoneOption = (code: string) =>
  COUNTRY_PHONE_OPTIONS.find((option) => option.code === code) || COUNTRY_PHONE_OPTIONS[0]

export const sanitizePhoneDigits = (value: string, maxDigits: number) =>
  value.replace(/\D/g, '').slice(0, maxDigits)

export const formatCountryPhoneOption = (option: (typeof COUNTRY_PHONE_OPTIONS)[number]) =>
  `${option.flag} ${option.code}`
