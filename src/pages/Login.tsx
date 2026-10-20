import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Button, Card, Form } from 'react-bootstrap'
import { authErrorMessage, useAuth } from '../contexts/AuthContext'
import { Loading } from '../components/Loading'

type Mode = 'signin' | 'signup' | 'reset'

export function Login() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (loading) return <Loading fullPage />
  if (user) return <Navigate to="/" replace />

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      if (success) setMessage(success)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'signin') void run(() => signInWithEmail(email, password))
    else if (mode === 'signup') void run(() => signUpWithEmail(name, email, password))
    else
      void run(
        () => resetPassword(email),
        'If an account exists for that email, a reset link is on its way.',
      )
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setMessage(null)
  }

  return (
    <div className="container py-5" style={{ maxWidth: 440 }}>
      <div className="text-center mb-4">
        <i className="bi bi-house-heart text-primary" style={{ fontSize: '3rem' }} />
        <h1 className="h3 mt-2">House Hub</h1>
        <p className="text-secondary">Shared expenses, bills and maintenance for your household.</p>
      </div>
      <Card>
        <Card.Body className="p-4">
          {mode !== 'reset' && (
            <>
              <Button
                variant="outline-dark"
                className="w-100 mb-3"
                disabled={busy}
                onClick={() => void run(signInWithGoogle)}
              >
                <i className="bi bi-google me-2" />
                Continue with Google
              </Button>
              <div className="text-center text-secondary small mb-3">or with email</div>
            </>
          )}
          <Form onSubmit={submit}>
            {mode === 'signup' && (
              <Form.Group className="mb-3" controlId="name">
                <Form.Label>Your name</Form.Label>
                <Form.Control required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Form.Group>
            )}
            <Form.Group className="mb-3" controlId="email">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Form.Group>
            {mode !== 'reset' && (
              <Form.Group className="mb-3" controlId="password">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </Form.Group>
            )}
            {error && <Alert variant="danger">{error}</Alert>}
            {message && <Alert variant="success">{message}</Alert>}
            <Button type="submit" className="w-100" disabled={busy}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </Form>
          <div className="d-flex justify-content-between mt-3 small">
            {mode === 'signin' ? (
              <>
                <Button variant="link" size="sm" className="p-0" onClick={() => switchMode('signup')}>
                  Create an account
                </Button>
                <Button variant="link" size="sm" className="p-0" onClick={() => switchMode('reset')}>
                  Forgot password?
                </Button>
              </>
            ) : (
              <Button variant="link" size="sm" className="p-0" onClick={() => switchMode('signin')}>
                Back to sign in
              </Button>
            )}
          </div>
        </Card.Body>
      </Card>
      <p className="text-center text-secondary small mt-3">
        Tenants: sign in with the email your landlord added to the household.
      </p>
    </div>
  )
}
