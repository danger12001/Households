import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveHousehold } from '../contexts/HouseholdContext'

export type HouseholdCollection =
  | 'expenses'
  | 'receipts'
  | 'settlements'
  | 'contractors'
  | 'events'
  | 'bills'
  | 'meterReadings'
  | 'ledgers'
  | 'ledgerEntries'
  | 'tenancies'
  | 'rentEntries'
  | 'assets'
  | 'assetLogs'
  | 'supplies'

/**
 * Live view of a household sub-collection. Households are small (tens to low
 * thousands of docs), so we sort and filter client-side and skip composite
 * indexes. `filter` narrows by one field, which tenants need wherever the
 * rules only let them read their own docs (ledgers).
 */
export function useHouseholdCollection<T extends { id: string }>(
  name: Exclude<HouseholdCollection, 'receipts'>,
  filter?: [field: string, value: string | null],
) {
  const { household } = useActiveHousehold()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [field, value] = filter ?? []

  useEffect(() => {
    const ref = collection(db, 'households', household.id, name)
    return onSnapshot(
      field ? query(ref, where(field, '==', value)) : ref,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T))
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error(`Loading ${name} failed:`, err)
        setError(err.message)
        setLoading(false)
      },
    )
  }, [household.id, name, field, value])

  return { items, loading, error }
}

/** Live view of a single document, or null while loading / when missing. */
export function useHouseholdDoc<T extends { id: string }>(name: HouseholdCollection, id: string | undefined) {
  const { household } = useActiveHousehold()
  const [item, setItem] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!id)

  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(db, 'households', household.id, name, id),
      (snapshot) => {
        setItem(snapshot.exists() ? ({ ...(snapshot.data() as Omit<T, 'id'>), id: snapshot.id } as T) : null)
        setLoading(false)
      },
      (err) => {
        console.error(`Loading ${name}/${id} failed:`, err)
        setLoading(false)
      },
    )
  }, [household.id, name, id])

  return { item: id ? item : null, loading: id ? loading : false }
}
