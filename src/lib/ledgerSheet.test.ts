import { describe, expect, it } from 'vitest'
import {
  entriesToRows,
  parseSheetAmount,
  parseSheetDate,
  parseSpreadsheetId,
  planSync,
  rowsToEntries,
} from './ledgerSheet'

const names: Record<string, string> = { m1: 'Paul', m2: 'Nathan & Sian' }
const memberName = (id: string | undefined) => (id && names[id]) || ''
const memberIdByName = (name: string) => Object.entries(names).find(([, n]) => n.toLowerCase() === name.toLowerCase())?.[0]

describe('parseSheetDate', () => {
  it.each([
    ['2026-03-05', '2026-03-05'],
    ['2026/3/5', '2026-03-05'],
    ['05/03/2026', '2026-03-05'],
    ['5-3-26', '2026-03-05'],
    [46086, '2026-03-05'],
  ])('%j -> %s', (input, expected) => {
    expect(parseSheetDate(input)).toBe(expected)
  })

  it('reads Date objects in local time', () => {
    expect(parseSheetDate(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('rejects junk', () => {
    expect(parseSheetDate('soon')).toBeNull()
  })
})

describe('parseSheetAmount', () => {
  it.each([
    [1250.5, 125050],
    ['R 1 250,50', 125050],
    ['-300', -30000],
    ['(300.00)', -30000],
    ['R-45', -4500],
  ])('%j -> %i', (input, cents) => {
    expect(parseSheetAmount(input)).toBe(cents)
  })
})

describe('round trip', () => {
  it('reads back what it writes', () => {
    const entries = [
      { id: 'e2', date: '2026-02-01', description: 'Tyres', amountCents: 450000, memberId: 'm2' },
      { id: 'e1', date: '2026-01-15', description: 'Deposit', amountCents: 2000000, notes: 'EFT' },
    ]
    const rows = entriesToRows(entries, memberName)
    expect(rows[1][0]).toBe('2026-01-15')
    const { entries: parsed, errors } = rowsToEntries(rows, memberIdByName)
    expect(errors).toEqual([])
    expect(parsed.map((p) => [p.id, p.amountCents, p.memberId])).toEqual([
      ['e1', 2000000, undefined],
      ['e2', 450000, 'm2'],
    ])
    expect(planSync(entries, parsed, true)).toEqual({ add: [], update: [], remove: [] })
  })
})

describe('rowsToEntries', () => {
  it('accepts header aliases, skips blanks and reports bad rows', () => {
    const { entries, errors } = rowsToEntries(
      [
        [],
        ['Item', 'Cost', 'Day'],
        ['Seat covers', 'R1 200', '01/02/2026'],
        [],
        ['Mystery', 'lots', '02/02/2026'],
      ],
      memberIdByName,
    )
    expect(entries).toMatchObject([{ description: 'Seat covers', amountCents: 120000, date: '2026-02-01', row: 3 }])
    expect(errors).toEqual(['Row 5: can\'t read the amount "lots"'])
  })

  it('complains about missing required columns', () => {
    expect(rowsToEntries([['Name', 'Amount']], memberIdByName).errors[0]).toMatch(/date, description/)
  })
})

describe('planSync', () => {
  const current = [
    { id: 'a', date: '2026-01-01', description: 'A', amountCents: 100 },
    { id: 'b', date: '2026-01-02', description: 'B', amountCents: 200 },
  ]

  it('adds rows without ids, updates changed ones, removes missing', () => {
    const plan = planSync(
      current,
      [
        { row: 2, id: 'a', date: '2026-01-01', description: 'A', amountCents: 150 },
        { row: 3, date: '2026-01-03', description: 'C', amountCents: 300 },
      ],
      true,
    )
    expect(plan.add.map((r) => r.description)).toEqual(['C'])
    expect(plan.update.map((u) => u.id)).toEqual(['a'])
    expect(plan.remove).toEqual(['b'])
  })

  it('keeps missing entries when appending', () => {
    expect(planSync(current, [], false).remove).toEqual([])
  })
})

describe('parseSpreadsheetId', () => {
  it('pulls the id from a sheet URL', () => {
    expect(parseSpreadsheetId('https://docs.google.com/spreadsheets/d/1AbC_def-GHIjklMNOpqrSTUvwxYZ0123456789/edit#gid=0')).toBe(
      '1AbC_def-GHIjklMNOpqrSTUvwxYZ0123456789',
    )
    expect(parseSpreadsheetId('not a sheet')).toBeNull()
  })
})
