import { collection, deleteField, doc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Household, RentEntry, Tenancy } from '../types'

const tenanciesRef = (hid: string) => collection(db, 'households', hid, 'tenancies')
const entriesRef = (hid: string) => collection(db, 'households', hid, 'rentEntries')

export async function saveTenancy(household: Household, tenancy: Omit<Tenancy, 'id' | 'tenantEmail' | 'updatedAt'>) {
  const tenantEmail = household.members[tenancy.memberId]?.email
  await setDoc(doc(tenanciesRef(household.id), tenancy.memberId), {
    ...tenancy,
    tenantEmail: tenantEmail ?? deleteField(),
    endDate: tenancy.endDate ?? deleteField(),
    depositCents: tenancy.depositCents ?? deleteField(),
    notes: tenancy.notes ?? deleteField(),
    updatedAt: Date.now(),
  }, { merge: true })
}

export async function addRentEntry(householdId: string, entry: Omit<RentEntry, 'id'>) {
  await setDoc(doc(entriesRef(householdId)), entry)
}

export async function reviewRentEntry(
  householdId: string,
  id: string,
  status: 'confirmed' | 'rejected',
  reviewer: string,
  reason?: string,
) {
  await updateDoc(doc(entriesRef(householdId), id), {
    status,
    rejectReason: status === 'rejected' && reason ? reason : deleteField(),
    reviewedBy: reviewer,
    reviewedAt: Date.now(),
  })
}

export async function deleteRentEntry(householdId: string, id: string) {
  const batch = writeBatch(db)
  batch.delete(doc(entriesRef(householdId), id))
  await batch.commit()
}

/** After a member's email changes, keep their rent visible to them. */
export async function relinkTenantRent(household: Household, memberId: string) {
  const tenantEmail = household.members[memberId]?.email
  const value = tenantEmail ?? deleteField()
  const batch = writeBatch(db)
  const tenancies = await getDocs(query(tenanciesRef(household.id), where('memberId', '==', memberId)))
  tenancies.docs.forEach((d) => batch.update(d.ref, { tenantEmail: value }))
  const entries = await getDocs(query(entriesRef(household.id), where('memberId', '==', memberId)))
  entries.docs.forEach((d) => batch.update(d.ref, { tenantEmail: value }))
  await batch.commit()
}
