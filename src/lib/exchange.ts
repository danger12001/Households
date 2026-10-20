// Exchange rates from Frankfurter (https://frankfurter.dev): free, no API key,
// CORS-enabled, published daily from the European Central Bank reference rates.

export const LANDLORD_CURRENCIES = [
  { code: 'EUR', label: 'Euro (Netherlands / eurozone)' },
  { code: 'ZAR', label: 'South African rand (no conversion)' },
  { code: 'GBP', label: 'British pound' },
  { code: 'USD', label: 'US dollar' },
  { code: 'AUD', label: 'Australian dollar' },
  { code: 'CAD', label: 'Canadian dollar' },
  { code: 'NZD', label: 'New Zealand dollar' },
  { code: 'CHF', label: 'Swiss franc' },
  { code: 'SEK', label: 'Swedish krona' },
  { code: 'NOK', label: 'Norwegian krone' },
  { code: 'DKK', label: 'Danish krone' },
] as const

export const RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface RateQuote {
  rate: number
  /** ECB publication date, 'YYYY-MM-DD'. */
  date: string
}

/** How many `to` one unit of `from` buys. */
export async function fetchRate(from: string, to: string): Promise<RateQuote> {
  // Frankfurter rejects same-currency lookups; a rand-based landlord just needs 1.
  if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) }
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Exchange rate lookup failed (${response.status})`)
  const body = (await response.json()) as { date: string; rates: Record<string, number> }
  const rate = body.rates[to]
  if (!rate) throw new Error(`No ${from}→${to} rate available`)
  return { rate, date: body.date }
}

export function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate)
}
