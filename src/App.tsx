import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { HouseholdProvider } from './contexts/HouseholdContext'
import { firebaseConfigured } from './firebase'
import { AppLayout } from './components/AppLayout'
import { HouseholdGate } from './components/HouseholdGate'
import { LandlordRoute } from './components/LandlordRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SetupNeeded } from './components/SetupNeeded'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Expenses } from './pages/Expenses'
import { ExpenseForm } from './pages/ExpenseForm'
import { Balances } from './pages/Balances'
import { Calendar } from './pages/Calendar'
import { EventForm } from './pages/EventForm'
import { Contractors } from './pages/Contractors'
import { Utilities } from './pages/Utilities'
import { BillForm } from './pages/BillForm'
import { HouseholdSettings } from './pages/HouseholdSettings'
import { Ledgers } from './pages/Ledgers'
import { LedgerDetail } from './pages/LedgerDetail'

function App() {
  if (!firebaseConfigured) return <SetupNeeded />

  return (
    <AuthProvider>
      <HouseholdProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <HouseholdGate>
                    <AppLayout />
                  </HouseholdGate>
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="expenses/new" element={<ExpenseForm />} />
              <Route path="expenses/:id" element={<ExpenseForm />} />
              <Route path="balances" element={<Balances />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="calendar/new" element={<LandlordRoute><EventForm /></LandlordRoute>} />
              <Route path="calendar/:id" element={<EventForm />} />
              <Route path="contractors" element={<Contractors />} />
              <Route path="utilities" element={<Utilities />} />
              <Route path="utilities/new" element={<LandlordRoute><BillForm /></LandlordRoute>} />
              <Route path="utilities/:id" element={<BillForm />} />
              <Route path="ledgers" element={<Ledgers />} />
              <Route path="ledgers/:id" element={<LedgerDetail />} />
              <Route path="household" element={<HouseholdSettings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </HouseholdProvider>
    </AuthProvider>
  )
}

export default App
