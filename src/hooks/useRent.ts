import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { todayISO } from '../lib/dates'
import { rentStatement, type RentStatement } from '../lib/rent'
import type { RentEntry, Tenancy } from '../types'
import { useHouseholdCollection } from './useHouseholdCollection'

/**
 * Tenancies and rent entries the viewer may see. Rules only let tenants read
 * their own, so their queries filter on email; landlords read everything.
 */
export function useRent() {
  const { email } = useAuth()
  const { isLandlord } = useActiveHousehold()
  const filter: [string, string | null] | undefined = isLandlord ? undefined : ['tenantEmail', email]
  const tenancies = useHouseholdCollection<Tenancy>('tenancies', filter)
  const entries = useHouseholdCollection<RentEntry>('rentEntries', filter)

  const statements = useMemo(() => {
    const today = todayISO()
    const map = new Map<string, RentStatement>()
    for (const tenancy of tenancies.items) {
      map.set(
        tenancy.memberId,
        rentStatement(tenancy, entries.items.filter((e) => e.memberId === tenancy.memberId), today),
      )
    }
    return map
  }, [tenancies.items, entries.items])

  return {
    tenancies: tenancies.items,
    entries: entries.items,
    statements,
    loading: tenancies.loading || entries.loading,
    error: tenancies.error ?? entries.error,
  }
}
