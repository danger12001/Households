// Date helpers that treat 'YYYY-MM-DD' strings as calendar days, doing the
// arithmetic in UTC so daylight-saving shifts never move a day.

const DAY_MS = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function nowLocalDateTime(): string {
  const d = new Date()
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUTC(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS)
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS)
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Same day-of-month n months later, clamped to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, months: number, dayOfMonth?: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const day = Math.min(dayOfMonth ?? d, daysInMonth(ny, nm))
  return `${ny}-${pad(nm)}-${pad(day)}`
}

/** Monday-first weekday index, 0..6. */
export function weekdayMon0(iso: string): number {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(local: string): string {
  if (!local) return ''
  const [date, time = '00:00'] = local.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(local: string): string {
  return local.split('T')[1]?.slice(0, 5) ?? ''
}
