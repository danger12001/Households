import { collection, doc, getDocs, increment, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { assetType } from '../lib/assets'
import type { Asset, AssetLog, Supply } from '../types'

const ref = (hid: string, name: 'assets' | 'assetLogs' | 'supplies') => collection(db, 'households', hid, name)

/** Creates the asset with its type's starter supplies (at zero stock). */
export async function createAsset(householdId: string, asset: Omit<Asset, 'id'>): Promise<string> {
  const assetRef = doc(ref(householdId, 'assets'))
  const batch = writeBatch(db)
  batch.set(assetRef, asset)
  for (const supply of assetType(asset.type).supplies) {
    batch.set(doc(ref(householdId, 'supplies')), {
      assetId: assetRef.id,
      name: supply.name,
      unit: supply.unit,
      quantity: 0,
      reorderAt: supply.reorderAt,
      updatedAt: Date.now(),
    } satisfies Omit<Supply, 'id'>)
  }
  await batch.commit()
  return assetRef.id
}

/** Saves a log and takes the supplies it used off stock, atomically. */
export async function addAssetLog(householdId: string, log: Omit<AssetLog, 'id'>) {
  const batch = writeBatch(db)
  batch.set(doc(ref(householdId, 'assetLogs')), log)
  for (const { supplyId, quantity } of log.supplyUsage) {
    batch.update(doc(ref(householdId, 'supplies'), supplyId), { quantity: increment(-quantity), updatedAt: Date.now() })
  }
  await batch.commit()
}

/** Deletes a log and puts the supplies it used back into stock. */
export async function deleteAssetLog(householdId: string, log: AssetLog, existingSupplyIds: Set<string>) {
  const batch = writeBatch(db)
  batch.delete(doc(ref(householdId, 'assetLogs'), log.id))
  for (const { supplyId, quantity } of log.supplyUsage) {
    if (existingSupplyIds.has(supplyId)) {
      batch.update(doc(ref(householdId, 'supplies'), supplyId), { quantity: increment(quantity), updatedAt: Date.now() })
    }
  }
  for (const receiptId of log.receiptIds) batch.delete(doc(db, 'households', householdId, 'receipts', receiptId))
  await batch.commit()
}

export async function adjustSupply(householdId: string, supplyId: string, delta: number) {
  const batch = writeBatch(db)
  batch.update(doc(ref(householdId, 'supplies'), supplyId), { quantity: increment(delta), updatedAt: Date.now() })
  await batch.commit()
}

export async function deleteAsset(householdId: string, assetId: string) {
  const [logs, supplies] = await Promise.all([
    getDocs(query(ref(householdId, 'assetLogs'), where('assetId', '==', assetId))),
    getDocs(query(ref(householdId, 'supplies'), where('assetId', '==', assetId))),
  ])
  const refs = [
    ...logs.docs.map((d) => d.ref),
    ...logs.docs.flatMap((d) =>
      ((d.data() as AssetLog).receiptIds ?? []).map((id) => doc(db, 'households', householdId, 'receipts', id)),
    ),
    ...supplies.docs.map((d) => d.ref),
    doc(ref(householdId, 'assets'), assetId),
  ]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((r) => batch.delete(r))
    await batch.commit()
  }
}
