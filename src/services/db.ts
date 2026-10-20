import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { HouseholdCollection } from '../hooks/useHouseholdCollection'
import { compressImage } from '../lib/images'
import { BASE_CURRENCY, type Bill, type Expense, type Household, type Member } from '../types'

type NewDoc<T> = Omit<T, 'id'>

function stripId<T extends { id?: string }>(data: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = data
  return rest
}

export async function addItem<T>(householdId: string, name: HouseholdCollection, data: NewDoc<T>) {
  const ref = await addDoc(collection(db, 'households', householdId, name), data as DocumentData)
  return ref.id
}

export async function updateItem(householdId: string, name: HouseholdCollection, id: string, data: DocumentData) {
  await updateDoc(doc(db, 'households', householdId, name, id), data)
}

export async function deleteItem(householdId: string, name: HouseholdCollection, id: string) {
  await deleteDoc(doc(db, 'households', householdId, name, id))
}

// ---- Households & members ----

export function newId(): string {
  return doc(collection(db, '_')).id
}

function withDerivedEmails(members: Record<string, Member>) {
  const all = Object.values(members)
  const emails = (filter: (m: Member) => boolean) =>
    [...new Set(all.filter((m) => m.email && filter(m)).map((m) => m.email!))]
  return {
    members,
    memberEmails: emails(() => true),
    landlordEmails: emails((m) => m.role === 'landlord'),
  }
}

export async function createHousehold(
  name: string,
  landlordCurrency: string,
  creator: { name: string; email: string },
) {
  const id = newId()
  const member: Member = {
    id: newId(),
    name: creator.name,
    email: creator.email,
    role: 'landlord',
    weight: 1,
    sharesUtilities: false,
  }
  const household: NewDoc<Household> = {
    name: name.trim(),
    currency: BASE_CURRENCY,
    landlordCurrency,
    rateSource: 'auto',
    createdAt: Date.now(),
    ...withDerivedEmails({ [member.id]: member }),
  }
  await setDoc(doc(db, 'households', id), household)
  return id
}

type SettingsUpdate = Partial<Pick<Household, 'name' | 'landlordCurrency' | 'rateUpdatedAt' | 'rateSource'>> & {
  /** null removes the stored rate (e.g. after changing currency). */
  exchangeRate?: number | null
}

export async function updateHouseholdSettings(householdId: string, data: SettingsUpdate) {
  const { exchangeRate, ...rest } = data
  await updateDoc(doc(db, 'households', householdId), {
    ...rest,
    ...(exchangeRate === null ? { exchangeRate: deleteField(), rateUpdatedAt: deleteField() } : {}),
    ...(typeof exchangeRate === 'number' ? { exchangeRate } : {}),
  })
}

export async function saveMembers(householdId: string, members: Record<string, Member>) {
  await updateDoc(doc(db, 'households', householdId), withDerivedEmails(members))
}

// ---- Receipts ----

export async function uploadReceipt(householdId: string, file: Blob, createdBy: string) {
  const image = await compressImage(file)
  return addItem(householdId, 'receipts', { ...image, createdBy, createdAt: Date.now() })
}

/**
 * Best-effort delete of photos no longer referenced (removed from a form, or
 * uploaded then abandoned). Failures just leave an orphan photo behind.
 */
export async function discardReceipts(householdId: string, ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      deleteItem(householdId, 'receipts', id).catch((error) => console.warn(`Couldn't delete receipt ${id}:`, error)),
    ),
  )
}

// ---- Expenses ----

export async function saveExpense(householdId: string, expense: NewDoc<Expense> & { id?: string }) {
  if (expense.id) {
    await updateItem(householdId, 'expenses', expense.id, { ...stripId(expense), updatedAt: Date.now() })
    return expense.id
  }
  return addItem<Expense>(householdId, 'expenses', expense)
}

/** Deletes the expense; its receipt photos go too unless something else uses them. */
export async function deleteExpense(householdId: string, expense: Expense) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'households', householdId, 'expenses', expense.id))
  for (const receiptId of expense.receiptIds) {
    batch.delete(doc(db, 'households', householdId, 'receipts', receiptId))
  }
  await batch.commit()
}

// ---- Utility bills ----

const UTILITY_LABEL = (utility: string) => utility.charAt(0).toUpperCase() + utility.slice(1)

/**
 * Saves the bill and the matching 'utilities' expense together, so the
 * split shows up in everyone's balances like any other expense.
 */
export async function saveBill(
  householdId: string,
  bill: NewDoc<Bill> & { id?: string },
  allocations: Record<string, number>,
) {
  const billRef = bill.id
    ? doc(db, 'households', householdId, 'bills', bill.id)
    : doc(collection(db, 'households', householdId, 'bills'))
  const expenseRef = bill.expenseId
    ? doc(db, 'households', householdId, 'expenses', bill.expenseId)
    : doc(collection(db, 'households', householdId, 'expenses'))

  const expense: NewDoc<Expense> = {
    description: `${UTILITY_LABEL(bill.utility)} bill ${bill.periodStart} to ${bill.periodEnd}`,
    category: 'utilities',
    amountCents: bill.amountCents,
    date: bill.periodEnd,
    paidBy: bill.paidBy,
    splitMethod: 'exact',
    splitInput: allocations,
    allocations,
    receiptIds: bill.receiptIds,
    notes: bill.notes,
    status: 'open',
    billId: billRef.id,
    createdBy: bill.createdBy,
    createdAt: bill.createdAt,
    updatedAt: Date.now(),
  }

  const batch = writeBatch(db)
  batch.set(billRef, { ...stripId(bill), expenseId: expenseRef.id })
  batch.set(expenseRef, expense)
  await batch.commit()
  return billRef.id
}

export async function deleteBill(householdId: string, bill: Bill) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'households', householdId, 'bills', bill.id))
  if (bill.expenseId) batch.delete(doc(db, 'households', householdId, 'expenses', bill.expenseId))
  for (const receiptId of bill.receiptIds) {
    batch.delete(doc(db, 'households', householdId, 'receipts', receiptId))
  }
  await batch.commit()
}
