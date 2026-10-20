import type { RentEntry, Tenancy } from '../types'
import { addMonths, daysInMonth } from './dates'

export interface StatementLine {
  date: string
  description: string
  /** Positive increases what's owed, negative reduces it. */
  amountCents: number
  /** Running balance after this line; positive = tenant owes. */
  balanceCents: number
  entryId?: string
}

export interface RentStatement {
  lines: StatementLine[]
  /** Positive = owed by the tenant, negative = paid in advance. */
  outstandingCents: number
  chargedCents: number
  paidCents: number
  nextDue: { date: string; amountCents: number } | null
}

/** Rent in effect on a date (the latest schedule entry starting on or before it). */
export function rentOn(schedule: Tenancy['schedule'], date: string): number {
  let amount = 0
  for (const step of [...schedule].sort((a, b) => a.from.localeCompare(b.from))) {
    if (step.from <= date) amount = step.amountCents
  }
  return amount
}

function dueDateIn(month: string, dueDay: number): string {
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(dueDay, daysInMonth(y, m))
  return `${month}-${String(day).padStart(2, '0')}`
}

/** Every rent due date from the start of the tenancy up to and including `until`. */
export function dueDates(tenancy: Pick<Tenancy, 'dueDay' | 'startDate' | 'endDate'>, until: string): string[] {
  const last = tenancy.endDate && tenancy.endDate < until ? tenancy.endDate : until
  const result: string[] = []
  for (let month = tenancy.startDate.slice(0, 7), i = 0; i < 1200; i++) {
    const due = dueDateIn(month, tenancy.dueDay)
    if (due > last) break
    if (due >= tenancy.startDate) result.push(due)
    month = addMonths(`${month}-01`, 1).slice(0, 7)
  }
  return result
}

function nextDueAfter(tenancy: Tenancy, asOf: string): { date: string; amountCents: number } | null {
  for (let month = asOf.slice(0, 7), i = 0; i < 24; i++) {
    const due = dueDateIn(month, tenancy.dueDay)
    if (tenancy.endDate && due > tenancy.endDate) return null
    if (due > asOf && due >= tenancy.startDate) return { date: due, amountCents: rentOn(tenancy.schedule, due) }
    month = addMonths(`${month}-01`, 1).slice(0, 7)
  }
  return null
}

const KIND_SIGN = { charge: 1, payment: -1, credit: -1 } as const
const KIND_LABEL = { charge: 'Charge', payment: 'Payment', credit: 'Credit' } as const

/** Monthly rent plus confirmed entries, oldest first, with a running balance. */
export function rentStatement(tenancy: Tenancy, entries: RentEntry[], asOf: string): RentStatement {
  const raw: Omit<StatementLine, 'balanceCents'>[] = [
    ...dueDates(tenancy, asOf).map((date) => ({
      date,
      description: `Rent ${new Date(`${date}T00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`,
      amountCents: rentOn(tenancy.schedule, date),
    })),
    ...entries
      .filter((e) => e.status === 'confirmed' && e.date <= asOf)
      .map((e) => ({
        date: e.date,
        description: e.note ? `${KIND_LABEL[e.kind]} – ${e.note}` : KIND_LABEL[e.kind],
        amountCents: KIND_SIGN[e.kind] * e.amountCents,
        entryId: e.id,
      })),
  ]
  // Same-day: charges before payments, so a payment on the due date reads as settling it.
  raw.sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents)

  let balance = 0
  let charged = 0
  let paid = 0
  const lines = raw.map((line) => {
    balance += line.amountCents
    if (line.amountCents > 0) charged += line.amountCents
    else paid -= line.amountCents
    return { ...line, balanceCents: balance }
  })
  return { lines, outstandingCents: balance, chargedCents: charged, paidCents: paid, nextDue: nextDueAfter(tenancy, asOf) }
}
