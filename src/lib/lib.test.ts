import { describe, expect, it } from 'vitest'
import type { HouseEvent, Member } from '../types'
import { computeNet, simplifyDebts } from './balances'
import { allocateBill, daysResident } from './billSplit'
import { addMonths, diffDays } from './dates'
import { parseMoney } from './money'
import { occurrencesBetween } from './recurrence'
import { allocateByWeights, resolveSplit } from './splits'

describe('parseMoney', () => {
  it.each([
    ['1250', 125000],
    ['1 250.50', 125050],
    ['R1,250.50', 125050],
    ['99,95', 9995],
    ['0.1', 10],
    ['12,000', 1200000],
  ])('%s -> %i', (input, cents) => {
    expect(parseMoney(input)).toBe(cents)
  })

  it.each(['', 'abc', '-5', '1.2.3'])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })
})

describe('allocateByWeights', () => {
  it('always sums to the total', () => {
    const parts = allocateByWeights(10000, { a: 1, b: 1, c: 1 })
    expect(Object.values(parts).reduce((x, y) => x + y)).toBe(10000)
    expect(parts).toEqual({ a: 3334, b: 3333, c: 3333 })
  })

  it('respects weights and skips zero weights', () => {
    expect(allocateByWeights(900, { a: 2, b: 1, c: 0 })).toEqual({ a: 600, b: 300 })
  })

  it('throws when nobody is included', () => {
    expect(() => allocateByWeights(100, { a: 0 })).toThrow()
  })
})

describe('resolveSplit', () => {
  it('equal ignores the entered values beyond inclusion', () => {
    expect(resolveSplit('equal', 1000, { a: 1, b: 5, c: 0 })).toEqual({ a: 500, b: 500 })
  })

  it('exact must match the total', () => {
    expect(resolveSplit('exact', 1000, { a: 700, b: 300 })).toEqual({ a: 700, b: 300 })
    expect(() => resolveSplit('exact', 1000, { a: 700 })).toThrow(/add up/)
  })
})

describe('balances', () => {
  it('nets expenses and settlements, ignoring disputed', () => {
    const net = computeNet(
      [
        { paidBy: 'a', allocations: { a: 300, b: 300, c: 300 }, status: 'open' },
        { paidBy: 'b', allocations: { a: 1000 }, status: 'disputed' },
      ],
      [{ from: 'b', to: 'a', amountCents: 100 }],
    )
    expect(net).toEqual({ a: 500, b: -200, c: -300 })
    expect(simplifyDebts(net)).toEqual([
      { from: 'c', to: 'a', amountCents: 300 },
      { from: 'b', to: 'a', amountCents: 200 },
    ])
  })
})

describe('bill splitting', () => {
  const member = (id: string, extra: Partial<Member> = {}): Member => ({
    id,
    name: id,
    role: 'tenant',
    weight: 1,
    sharesUtilities: true,
    ...extra,
  })

  it('counts resident days inclusively', () => {
    expect(daysResident({}, '2026-01-01', '2026-01-31')).toBe(31)
    expect(daysResident({ moveIn: '2026-01-16' }, '2026-01-01', '2026-01-31')).toBe(16)
    expect(daysResident({ moveOut: '2025-12-31' }, '2026-01-01', '2026-01-31')).toBe(0)
  })

  it('splits by occupancy x weight', () => {
    const members = {
      a: member('a', { weight: 2 }),
      b: member('b', { moveIn: '2026-01-16' }),
    }
    const allocations = allocateBill(
      {
        amountCents: 4800,
        splitMethod: 'occupancy',
        participants: ['a', 'b'],
        usage: {},
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      },
      members,
    )
    // a: 2 x 31 = 62, b: 1 x 16 = 16 -> 62/78 and 16/78 of 4800
    expect(allocations).toEqual({ a: 3815, b: 985 })
  })

  it('splits by sub-meter usage', () => {
    const allocations = allocateBill(
      {
        amountCents: 1000,
        splitMethod: 'usage',
        participants: ['a', 'b'],
        usage: { a: 150, b: 50 },
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      },
      { a: member('a'), b: member('b') },
    )
    expect(allocations).toEqual({ a: 750, b: 250 })
  })
})

describe('dates', () => {
  it('clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2, 31)).toBe('2026-03-31')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
  })

  it('diffs across DST-free calendar days', () => {
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31)
  })
})

describe('occurrencesBetween', () => {
  const event = (extra: Partial<HouseEvent>): HouseEvent => ({
    id: 'e',
    title: 'Pool service',
    kind: 'pool',
    start: '2026-01-05T09:00',
    durationMinutes: 60,
    recurrence: 'none',
    status: 'scheduled',
    createdBy: 'x',
    createdAt: 0,
    ...extra,
  })

  it('one-off events appear only in range', () => {
    expect(occurrencesBetween(event({}), '2026-01-01', '2026-01-31')).toHaveLength(1)
    expect(occurrencesBetween(event({}), '2026-02-01', '2026-02-28')).toHaveLength(0)
  })

  it('weekly events repeat until recurUntil', () => {
    const starts = occurrencesBetween(
      event({ recurrence: 'weekly', recurUntil: '2026-02-10' }),
      '2026-02-01',
      '2026-02-28',
    ).map((o) => o.start)
    expect(starts).toEqual(['2026-02-02T09:00', '2026-02-09T09:00'])
  })

  it('monthly events keep their day of month', () => {
    const starts = occurrencesBetween(
      event({ start: '2026-01-31T08:00', recurrence: 'monthly' }),
      '2026-02-01',
      '2026-03-31',
    ).map((o) => o.start)
    expect(starts).toEqual(['2026-02-28T08:00', '2026-03-31T08:00'])
  })
})
