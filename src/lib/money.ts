const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: number, currency: string): string {
  let formatter = formatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency })
    formatters.set(currency, formatter)
  }
  return formatter.format(cents / 100)
}

/**
 * Parses user-typed money ("1 250", "1250.5", "R1,250.50", "99,95") into cents.
 * A lone comma followed by 1-2 digits is a decimal comma; other commas are
 * thousands separators. Returns null for anything unparseable or negative.
 */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (!s.includes('.') && /^-?\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null
  const value = Number(s)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

export function centsToInput(cents: number | undefined): string {
  if (cents === undefined) return ''
  return (cents / 100).toFixed(2)
}
