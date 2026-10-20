import { useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Button, Card, Form } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useHousehold } from '../contexts/HouseholdContext'
import { useExchangeRateRefresh } from '../hooks/useExchangeRateRefresh'
import { LANDLORD_CURRENCIES } from '../lib/exchange'
import { createHousehold } from '../services/db'
import { Loading } from './Loading'

/** Renders children only once the user belongs to a household; otherwise offers to create one. */
export function HouseholdGate({ children }: { children: ReactNode }) {
  const { household, loading, error } = useHousehold()

  if (loading) return <Loading fullPage />
  if (!household) return <NoHousehold error={error} />
  return <WithRateRefresh>{children}</WithRateRefresh>
}

function WithRateRefresh({ children }: { children: ReactNode }) {
  useExchangeRateRefresh()
  return <>{children}</>
}

function NoHousehold({ error }: { error: string | null }) {
  const { user, email, signOut } = useAuth()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    setSaving(true)
    setSaveError(null)
    try {
      await createHousehold(name, currency, { name: user?.displayName || email, email })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <Card>
        <Card.Body className="p-4">
          <h1 className="h4">
            <i className="bi bi-house-door me-2" />
            Welcome{user?.displayName ? `, ${user.displayName}` : ''}
          </h1>
          {error && <Alert variant="danger">Couldn't load your households: {error}</Alert>}
          <p>
            You're not part of a household yet. <strong>Tenants:</strong> ask your landlord to add{' '}
            <strong>{email}</strong> in House Hub, and it will appear here automatically.
          </p>
          {!creating ? (
            <div className="d-grid gap-2">
              <Button variant="outline-primary" onClick={() => setCreating(true)}>
                I'm a landlord – create a household
              </Button>
              <Button variant="link" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          ) : (
            <Form onSubmit={submit}>
              <Form.Group className="mb-3">
                <Form.Label>Household name</Form.Label>
                <Form.Control
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 12 Protea Street"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Your home currency</Form.Label>
                <Form.Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {LANDLORD_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} – {c.label}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text>Amounts are recorded in rand; landlords also see them converted to this.</Form.Text>
              </Form.Group>
              {saveError && <Alert variant="danger">{saveError}</Alert>}
              <div className="d-flex gap-2">
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? 'Creating…' : 'Create household'}
                </Button>
                <Button variant="outline-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </Form>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
