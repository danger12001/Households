import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Button, Card } from 'react-bootstrap'
import { authErrorMessage, useAuth } from '../contexts/AuthContext'
import { Loading } from './Loading'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <Loading fullPage />
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <VerifyEmail />
  return <>{children}</>
}

function VerifyEmail() {
  const { user, resendVerification, refreshUser, signOut } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>, success?: string) => {
    setError(null)
    setMessage(null)
    try {
      await action()
      if (success) setMessage(success)
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <Card>
        <Card.Body className="p-4">
          <h1 className="h4">
            <i className="bi bi-envelope-check me-2" />
            Verify your email
          </h1>
          <p>
            We sent a verification link to <strong>{user?.email}</strong>. Click it, then come back and press{' '}
            <em>I've verified</em>.
          </p>
          {message && <Alert variant="success">{message}</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="d-grid gap-2">
            <Button onClick={() => run(refreshUser)}>I've verified</Button>
            <Button variant="outline-secondary" onClick={() => run(resendVerification, 'Verification email sent.')}>
              Resend email
            </Button>
            <Button variant="link" onClick={() => void signOut()}>
              Use a different account
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
