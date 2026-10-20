import { useEffect } from 'react'
import { Loading } from '../components/Loading'

/**
 * Public route (no sign-in) for the landlord overview. The overview itself is
 * a static page in public/overview.html so it can be read and shared without
 * loading the app or Firebase.
 */
export function Overview() {
  useEffect(() => {
    window.location.replace(`${import.meta.env.BASE_URL}overview.html`)
  }, [])
  return <Loading fullPage />
}
