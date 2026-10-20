import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useHousehold } from '../contexts/HouseholdContext'

/** Hides landlord-only pages from tenants; Firestore rules enforce the same thing server-side. */
export function LandlordRoute({ children }: { children: ReactNode }) {
  const { isLandlord } = useHousehold()
  if (!isLandlord) return <Navigate to="/" replace />
  return <>{children}</>
}
