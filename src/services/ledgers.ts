import { collection, deleteField, doc, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { entriesToRows, planSync, rowsToEntries, type ParsedRow, type SyncPlan } from '../lib/ledgerSheet'
import type { Household, Ledger, LedgerEntry } from '../types'
import { cachedSheetsToken, readTab, writeTab } from './sheets'

const ledgersRef = (hid: string) => collection(db, 'households', hid, 'ledgers')
const entriesRef = (hid: string) => collection(db, 'households', hid, 'ledgerEntries')

export function ledgerTotal(entries: LedgerEntry[]): number {
  return entries.filter((e) => e.status === 'approved').reduce((sum, e) => sum + e.amountCents, 0)
}

export function memberLookups(household: Household) {
  const members = Object.values(household.members)
  return {
    memberName: (id: string | undefined) => (id && household.members[id]?.name) || '',
    memberIdByName: (name: string) => members.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())?.id,
  }
}

export async function saveLedger(
  household: Household,
  ledger: Omit<Ledger, 'id' | 'tenantEmail'> & { id?: string },
): Promise<string> {
  const ref = ledger.id ? doc(ledgersRef(household.id), ledger.id) : doc(ledgersRef(household.id))
  const tenantEmail = ledger.tenantId ? household.members[ledger.tenantId]?.email : undefined
  const { id: _id, ...data } = ledger
  const batch = writeBatch(db)
  batch.set(ref, {
    ...data,
    tenantId: data.tenantId ?? deleteField(),
    tenantEmail: tenantEmail ?? deleteField(),
    targetCents: data.targetCents ?? deleteField(),
    description: data.description ?? deleteField(),
  }, { merge: true })
  // Entries carry the tenant email for rules, so re-stamp them when the tenant changes.
  if (ledger.id) {
    const entries = await getDocs(query(entriesRef(household.id), where('ledgerId', '==', ledger.id)))
    for (const entry of entries.docs) {
      if (entry.data().tenantEmail !== tenantEmail) {
        batch.update(entry.ref, { tenantEmail: tenantEmail ?? deleteField() })
      }
    }
  }
  await batch.commit()
  return ref.id
}

/** After a member's email changes, keep their ledgers (and entries) visible to them. */
export async function relinkTenantLedgers(household: Household, memberId: string) {
  const ledgers = await getDocs(query(ledgersRef(household.id), where('tenantId', '==', memberId)))
  for (const ledger of ledgers.docs) {
    const data = ledger.data() as Omit<Ledger, 'id'>
    await saveLedger(household, { ...data, id: ledger.id })
  }
}

export async function deleteLedger(householdId: string, ledgerId: string) {
  const entries = await getDocs(query(entriesRef(householdId), where('ledgerId', '==', ledgerId)))
  const receiptIds = entries.docs.flatMap((d) => (d.data() as LedgerEntry).receiptIds ?? [])
  const refs = [
    ...entries.docs.map((d) => d.ref),
    ...receiptIds.map((id) => doc(db, 'households', householdId, 'receipts', id)),
    doc(ledgersRef(householdId), ledgerId),
  ]
  // Firestore batches cap at 500 writes.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

export function newEntryRef(householdId: string) {
  return doc(entriesRef(householdId))
}

export function sheetSummary(ledger: Ledger, entries: LedgerEntry[]): (string | number)[][] {
  const total = ledgerTotal(entries) / 100
  return [
    ['Total (ZAR)', total],
    ['Target (ZAR)', ledger.targetCents !== undefined ? ledger.targetCents / 100 : ''],
    ['Updated by House Hub', new Date().toISOString().slice(0, 16).replace('T', ' ')],
  ]
}

async function fetchEntries(householdId: string, ledgerId: string): Promise<LedgerEntry[]> {
  const snapshot = await getDocs(query(entriesRef(householdId), where('ledgerId', '==', ledgerId)))
  return snapshot.docs.map((d) => ({ ...(d.data() as Omit<LedgerEntry, 'id'>), id: d.id }))
}

/** Writes the ledger's approved entries (read fresh, never from stale UI state) to the linked sheet. */
export async function pushToSheet(token: string, household: Household, ledger: Ledger) {
  if (!ledger.sheet) throw new Error('No Google Sheet linked')
  const approved = (await fetchEntries(household.id, ledger.id)).filter((e) => e.status === 'approved')
  const { memberName } = memberLookups(household)
  await writeTab(
    token,
    ledger.sheet.spreadsheetId,
    ledger.sheet.tab,
    entriesToRows(approved, memberName),
    sheetSummary(ledger, approved),
  )
  const batch = writeBatch(db)
  batch.update(doc(ledgersRef(household.id), ledger.id), { 'sheet.lastPushedAt': Date.now() })
  await batch.commit()
}

/**
 * Push without prompting if this browser already holds a Sheets token
 * (i.e. the landlord connected during this session). Returns whether it ran.
 */
export async function autoPush(household: Household, ledger: Ledger): Promise<boolean> {
  const token = cachedSheetsToken()
  if (!token || !ledger.sheet) return false
  await pushToSheet(token, household, ledger)
  return true
}

export async function readSheetPlan(
  token: string,
  household: Household,
  ledger: Ledger,
  entries: LedgerEntry[],
): Promise<{ plan: SyncPlan; errors: string[] }> {
  if (!ledger.sheet) throw new Error('No Google Sheet linked')
  const rows = await readTab(token, ledger.sheet.spreadsheetId, ledger.sheet.tab)
  // Only the entry table (A:G) - the summary block lives in I:J.
  const table = rows.map((r) => r.slice(0, 7))
  const { entries: parsed, errors } = rowsToEntries(table, memberLookups(household).memberIdByName)
  return { plan: planSync(entries.filter((e) => e.status === 'approved'), parsed, true), errors }
}

export async function readFilePlan(
  file: File,
  household: Household,
  entries: LedgerEntry[],
  removeMissing: boolean,
): Promise<{ plan: SyncPlan; errors: string[] }> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { plan: { add: [], update: [], remove: [] }, errors: ['The file has no sheets'] }
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
  const { entries: parsed, errors } = rowsToEntries(
    rows.map((r) => r.slice(0, 7)),
    memberLookups(household).memberIdByName,
  )
  return { plan: planSync(entries.filter((e) => e.status === 'approved'), parsed, removeMissing), errors }
}

/** Applies a sync plan as approved entries. */
export async function applyPlan(
  householdId: string,
  ledger: Ledger,
  plan: SyncPlan,
  email: string,
  source: 'sheet' | 'upload',
) {
  const now = Date.now()
  const fields = (row: ParsedRow) => ({
    date: row.date,
    description: row.description,
    amountCents: row.amountCents,
    category: row.category ?? deleteField(),
    memberId: row.memberId ?? deleteField(),
    notes: row.notes ?? deleteField(),
  })
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [
    ...plan.add.map((row) => (batch: ReturnType<typeof writeBatch>) => {
      const ref = newEntryRef(householdId)
      batch.set(ref, {
        ...fields(row),
        category: row.category,
        memberId: row.memberId,
        notes: row.notes,
        ledgerId: ledger.id,
        tenantEmail: ledger.tenantEmail,
        receiptIds: [],
        status: 'approved',
        createdBy: email,
        createdAt: now,
        reviewedBy: email,
        reviewedAt: now,
      })
    }),
    ...plan.update.map(({ id, row }) => (batch: ReturnType<typeof writeBatch>) => {
      batch.update(doc(entriesRef(householdId), id), fields(row))
    }),
    ...plan.remove.map((id) => (batch: ReturnType<typeof writeBatch>) => {
      batch.delete(doc(entriesRef(householdId), id))
    }),
  ]
  for (let i = 0; i < writes.length; i += 450) {
    const batch = writeBatch(db)
    writes.slice(i, i + 450).forEach((w) => w(batch))
    if (i + 450 >= writes.length && source === 'sheet') {
      batch.update(doc(ledgersRef(householdId), ledger.id), { 'sheet.lastPulledAt': now })
    }
    await batch.commit()
  }
}

export async function downloadXlsx(household: Household, ledger: Ledger, entries: LedgerEntry[]) {
  const XLSX = await import('xlsx')
  const approved = entries.filter((e) => e.status === 'approved')
  const sheet = XLSX.utils.aoa_to_sheet(entriesToRows(approved, memberLookups(household).memberName))
  XLSX.utils.sheet_add_aoa(sheet, sheetSummary(ledger, approved), { origin: 'I1' })
  sheet['!cols'] = [{ wch: 11 }, { wch: 36 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 30 }, { wch: 22 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, ledger.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Ledger')
  XLSX.writeFile(workbook, `${ledger.name.replace(/[^\w -]+/g, '').trim() || 'ledger'}.xlsx`)
}
