// Mapping between ledger entries and spreadsheet rows, shared by the Google
// Sheets sync and .xlsx/.csv upload/download. The Id column lets a round trip
// match rows back to entries; rows without an Id are treated as new.

import type { LedgerEntry } from '../types'
import { parseMoney } from './money'

export const LEDGER_HEADERS = ['Date', 'Description', 'Category', 'Who', 'Amount (ZAR)', 'Notes', 'Id'] as const

type Cell = string | number | boolean | Date | null | undefined

export interface ParsedRow {
  /** 1-based spreadsheet row number, for error messages. */
  row: number
  id?: string
  date: string
  description: string
  category?: string
  memberId?: string
  amountCents: number
  notes?: string
}

const COLUMN_ALIASES: Record<string, keyof typeof COLUMN_KEYS> = {
  date: 'date',
  day: 'date',
  description: 'description',
  item: 'description',
  details: 'description',
  what: 'description',
  category: 'category',
  type: 'category',
  who: 'who',
  person: 'who',
  'paid by': 'who',
  member: 'who',
  amount: 'amount',
  'amount (zar)': 'amount',
  'amount zar': 'amount',
  value: 'amount',
  cost: 'amount',
  price: 'amount',
  total: 'amount',
  notes: 'notes',
  note: 'notes',
  comment: 'notes',
  id: 'id',
}

const COLUMN_KEYS = { date: 0, description: 0, category: 0, who: 0, amount: 0, notes: 0, id: 0 }

export function entriesToRows(
  entries: Pick<LedgerEntry, 'id' | 'date' | 'description' | 'category' | 'memberId' | 'amountCents' | 'notes'>[],
  memberName: (id: string | undefined) => string,
): (string | number)[][] {
  return [
    [...LEDGER_HEADERS],
    ...[...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [
        e.date,
        e.description,
        e.category ?? '',
        e.memberId ? memberName(e.memberId) : '',
        e.amountCents / 100,
        e.notes ?? '',
        e.id,
      ]),
  ]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Spreadsheet date serial (days since 1899-12-30) to 'YYYY-MM-DD'. */
function serialToISO(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function parseSheetDate(cell: Cell): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`
  }
  if (typeof cell === 'number' && cell > 1 && cell < 100_000) return serialToISO(cell)
  if (typeof cell !== 'string') return null
  const s = cell.trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
  // South African / European day-first dates: 31/01/2026, 31-01-26
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  }
  return null
}

export function parseSheetAmount(cell: Cell): number | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) return Math.round(cell * 100)
  if (typeof cell !== 'string') return null
  let s = cell.trim()
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.includes('-')) {
    negative = true
    s = s.replace('-', '')
  }
  const cents = parseMoney(s)
  return cents === null ? null : negative ? -cents : cents
}

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return String(cell).trim()
}

/**
 * Reads rows (first row = headers) into entries. Unknown columns are ignored,
 * blank rows skipped; rows that can't be read are reported, not guessed at.
 */
export function rowsToEntries(
  rows: Cell[][],
  memberIdByName: (name: string) => string | undefined,
): { entries: ParsedRow[]; errors: string[] } {
  const headerIndex = rows.findIndex((r) => r.some((c) => text(c)))
  if (headerIndex < 0) return { entries: [], errors: ['The sheet is empty'] }

  const columns: Partial<Record<keyof typeof COLUMN_KEYS, number>> = {}
  rows[headerIndex].forEach((cell, i) => {
    const key = COLUMN_ALIASES[text(cell).toLowerCase()]
    if (key && columns[key] === undefined) columns[key] = i
  })
  const missing = (['date', 'description', 'amount'] as const).filter((k) => columns[k] === undefined)
  if (missing.length) {
    return {
      entries: [],
      errors: [`Missing column(s): ${missing.join(', ')}. Expected headers like ${LEDGER_HEADERS.join(', ')}.`],
    }
  }

  const entries: ParsedRow[] = []
  const errors: string[] = []
  const get = (row: Cell[], key: keyof typeof COLUMN_KEYS) =>
    columns[key] === undefined ? undefined : row[columns[key]!]

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const rowNumber = headerIndex + i + 2
    if (!row.some((c) => text(c))) return
    const date = parseSheetDate(get(row, 'date'))
    const amountCents = parseSheetAmount(get(row, 'amount'))
    const description = text(get(row, 'description'))
    if (!date) return errors.push(`Row ${rowNumber}: can't read the date "${text(get(row, 'date'))}"`)
    if (amountCents === null) return errors.push(`Row ${rowNumber}: can't read the amount "${text(get(row, 'amount'))}"`)
    if (!description) return errors.push(`Row ${rowNumber}: description is empty`)
    const who = text(get(row, 'who'))
    entries.push({
      row: rowNumber,
      id: text(get(row, 'id')) || undefined,
      date,
      description,
      category: text(get(row, 'category')) || undefined,
      memberId: who ? memberIdByName(who) : undefined,
      amountCents,
      notes: text(get(row, 'notes')) || undefined,
    })
  })
  return { entries, errors }
}

export interface SyncPlan {
  add: ParsedRow[]
  update: { id: string; row: ParsedRow }[]
  remove: string[]
}

/** What applying the sheet would change, given the ledger's current approved entries. */
export function planSync(
  current: Pick<LedgerEntry, 'id' | 'date' | 'description' | 'category' | 'memberId' | 'amountCents' | 'notes'>[],
  parsed: ParsedRow[],
  removeMissing: boolean,
): SyncPlan {
  const byId = new Map(current.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const plan: SyncPlan = { add: [], update: [], remove: [] }

  for (const row of parsed) {
    const existing = row.id ? byId.get(row.id) : undefined
    if (!existing || seen.has(existing.id)) {
      plan.add.push(row)
      continue
    }
    seen.add(existing.id)
    const changed =
      existing.date !== row.date ||
      existing.description !== row.description ||
      (existing.category ?? '') !== (row.category ?? '') ||
      (existing.memberId ?? '') !== (row.memberId ?? '') ||
      existing.amountCents !== row.amountCents ||
      (existing.notes ?? '') !== (row.notes ?? '')
    if (changed) plan.update.push({ id: existing.id, row })
  }
  if (removeMissing) plan.remove = current.filter((e) => !seen.has(e.id)).map((e) => e.id)
  return plan
}

export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim()
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  return /^[a-zA-Z0-9-_]{25,}$/.test(s) ? s : null
}
