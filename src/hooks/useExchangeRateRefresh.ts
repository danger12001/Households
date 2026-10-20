import { useEffect, useRef } from 'react'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { fetchRate, RATE_MAX_AGE_MS } from '../lib/exchange'
import { updateHouseholdSettings } from '../services/db'

/**
 * When a landlord opens the app and the household uses an 'auto' rate older
 * than a day, fetch today's rate and store it on the household so everyone
 * sees the same figure. Only landlords may write the household doc.
 */
export function useExchangeRateRefresh() {
  const { household, isLandlord } = useActiveHousehold()
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (!isLandlord || household.rateSource === 'manual') return
    const stale = !household.exchangeRate || !household.rateUpdatedAt || Date.now() - household.rateUpdatedAt > RATE_MAX_AGE_MS
    const key = `${household.id}:${household.landlordCurrency}`
    if (!stale || attempted.current === key) return
    attempted.current = key

    fetchRate(household.currency, household.landlordCurrency)
      .then(({ rate }) =>
        updateHouseholdSettings(household.id, { exchangeRate: rate, rateUpdatedAt: Date.now(), rateSource: 'auto' }),
      )
      .catch((error) => console.warn('Exchange rate refresh failed:', error))
  }, [household, isLandlord])
}
