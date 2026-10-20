import { describe, expect, it } from 'vitest'
import type { RentEntry, Tenancy } from '../types'
import { dueDates, rentOn, rentStatement } from './rent'

const tenancy = (extra: Partial<Tenancy> = {}): Tenancy => ({
  id: 'm1',
  memberId: 'm1',
  dueDay: 1,
  startDate: '2026-01-01',
  schedule: [{ from: '2026-01-01', amountCents: 800000 }],
  updatedAt: 0,
  ...extra,
})

const entry = (extra: Partial<RentEntry>): RentEntry => ({
  id: 'e',
  memberId: 'm1',
  kind: 'payment',
  amountCents: 0,
  date: '2026-01-01',
  receiptIds: [],
  status: 'confirmed',
  createdBy: 'x',
  createdAt: 0,
  ...extra,
})

describe('dueDates', () => {
  it('starts at the first due date on or after the start', () => {
    expect(dueDates(tenancy({ startDate: '2026-01-15' }), '2026-03-31')).toEqual(['2026-02-01', '2026-03-01'])
  })

  it('clamps to short months and stops at the end date', () => {
    expect(dueDates(tenancy({ dueDay: 31, endDate: '2026-03-15' }), '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })

  it('includes a due date that is today', () => {
    expect(dueDates(tenancy(), '2026-02-01')).toEqual(['2026-01-01', '2026-02-01'])
  })
})

describe('rentOn', () => {
  it('uses the latest step on or before the date', () => {
    const schedule = [
      { from: '2027-01-01', amountCents: 850000 },
      { from: '2026-01-01', amountCents: 800000 },
    ]
    expect(rentOn(schedule, '2026-12-01')).toBe(800000)
    expect(rentOn(schedule, '2027-01-01')).toBe(850000)
    expect(rentOn(schedule, '2025-12-01')).toBe(0)
  })
})

describe('rentStatement', () => {
  it('nets rent, payments, charges and credits, ignoring unconfirmed', () => {
    const statement = rentStatement(
      tenancy({ schedule: [
        { from: '2026-01-01', amountCents: 800000 },
        { from: '2026-03-01', amountCents: 850000 },
      ] }),
      [
        entry({ id: 'deposit', kind: 'charge', amountCents: 800000, date: '2026-01-01', note: 'Deposit' }),
        entry({ id: 'p1', amountCents: 1600000, date: '2026-01-01' }),
        entry({ id: 'p2', amountCents: 800000, date: '2026-02-03' }),
        entry({ id: 'c1', kind: 'credit', amountCents: 50000, date: '2026-03-05', note: 'Broken geyser' }),
        entry({ id: 'pending', amountCents: 999999, date: '2026-03-02', status: 'pending' }),
      ],
      '2026-03-10',
    )
    // charged 8000 + 8000 (deposit) + 8000 + 8500 = 32500; paid 16000 + 8000 + 500 = 24500
    expect(statement.chargedCents).toBe(3250000)
    expect(statement.paidCents).toBe(2450000)
    expect(statement.outstandingCents).toBe(800000)
    expect(statement.nextDue).toEqual({ date: '2026-04-01', amountCents: 850000 })
    expect(statement.lines.at(-1)?.balanceCents).toBe(800000)
    // Same-day charges come before the payment.
    expect(statement.lines.slice(0, 3).map((l) => l.amountCents)).toEqual([800000, 800000, -1600000])
  })

  it('has no next due date after the tenancy ends', () => {
    expect(rentStatement(tenancy({ endDate: '2026-02-15' }), [], '2026-02-20').nextDue).toBeNull()
  })
})
