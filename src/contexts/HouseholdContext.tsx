import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import type { Household, Member } from '../types'

interface HouseholdContextValue {
  households: Household[]
  loading: boolean
  error: string | null
  household: Household | null
  /** Members sorted landlords first, then by name. */
  members: Member[]
  /** The signed-in user's member record in the active household. */
  me: Member | null
  isLandlord: boolean
  selectHousehold: (id: string) => void
  memberName: (id: string | undefined) => string
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined)

const ACTIVE_KEY = 'house-hub.activeHousehold'

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { email } = useAuth()
  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(readActive)

  useEffect(() => {
    if (!email) {
      setHouseholds([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(collection(db, 'households'), where('memberEmails', 'array-contains', email))
    return onSnapshot(
      q,
      (snapshot) => {
        setHouseholds(
          snapshot.docs
            .map((d) => ({ ...(d.data() as Omit<Household, 'id'>), id: d.id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('Loading households failed:', err)
        setError(err.message)
        setLoading(false)
      },
    )
  }, [email])

  const value = useMemo<HouseholdContextValue>(() => {
    const household = households.find((h) => h.id === activeId) ?? households[0] ?? null
    const members = household
      ? Object.values(household.members).sort(
          (a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'landlord' ? -1 : 1),
        )
      : []
    const me = members.find((m) => m.email && m.email === email) ?? null
    return {
      households,
      loading,
      error,
      household,
      members,
      me,
      isLandlord: !!email && !!household?.landlordEmails.includes(email),
      selectHousehold: (id: string) => {
        setActiveId(id)
        try {
          localStorage.setItem(ACTIVE_KEY, id)
        } catch {
          // Storage unavailable (private mode) - selection just won't persist.
        }
      },
      memberName: (id) => (id && household?.members[id]?.name) || 'Unknown',
    }
  }, [households, loading, error, activeId, email])

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const context = useContext(HouseholdContext)
  if (!context) {
    throw new Error('useHousehold must be used within a HouseholdProvider')
  }
  return context
}

/** For pages rendered behind HouseholdGate, where a household always exists. */
export function useActiveHousehold() {
  const context = useHousehold()
  if (!context.household) {
    throw new Error('useActiveHousehold used outside HouseholdGate')
  }
  return { ...context, household: context.household }
}
