import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import type { Ledger, LedgerEntry } from '../types'
import { useHouseholdCollection } from './useHouseholdCollection'

/**
 * Ledgers the viewer may see. Rules only let tenants read ledgers linked to
 * their email, so their queries must filter on it; landlords read everything.
 */
export function useLedgers() {
  const { email } = useAuth()
  const { isLandlord } = useActiveHousehold()
  return useHouseholdCollection<Ledger>('ledgers', isLandlord ? undefined : ['tenantEmail', email])
}

export function useLedgerEntries(ledgerId?: string) {
  const { email } = useAuth()
  const { isLandlord } = useActiveHousehold()
  const result = useHouseholdCollection<LedgerEntry>(
    'ledgerEntries',
    isLandlord ? (ledgerId ? ['ledgerId', ledgerId] : undefined) : ['tenantEmail', email],
  )
  const items = useMemo(
    () =>
      result.items
        .filter((e) => !ledgerId || e.ledgerId === ledgerId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [result.items, ledgerId],
  )
  return { ...result, items }
}
