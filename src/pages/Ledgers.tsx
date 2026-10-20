import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Col, Form, InputGroup, ProgressBar, Row } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useLedgerEntries, useLedgers } from '../hooks/useLedgers'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { centsToInput, parseMoney } from '../lib/money'
import { ledgerTotal, saveLedger } from '../services/ledgers'
import type { Ledger } from '../types'

export function Ledgers() {
  const { isLandlord, memberName } = useActiveHousehold()
  const ledgers = useLedgers()
  const entries = useLedgerEntries()
  const [creating, setCreating] = useState(false)

  const totals = useMemo(() => {
    const byLedger = new Map<string, { total: number; pending: number }>()
    for (const ledger of ledgers.items) {
      const own = entries.items.filter((e) => e.ledgerId === ledger.id)
      byLedger.set(ledger.id, { total: ledgerTotal(own), pending: own.filter((e) => e.status === 'pending').length })
    }
    return byLedger
  }, [ledgers.items, entries.items])

  return (
    <>
      <PageHeader
        title="Ledgers"
        icon="journal-text"
        actions={
          isLandlord && !creating && (
            <Button onClick={() => setCreating(true)}>
              <i className="bi bi-plus-lg me-1" />
              New ledger
            </Button>
          )
        }
      />
      <p className="text-secondary small">
        Separate running totals that don't affect household balances – e.g. a car being paid off, with household
        purchases counting towards it. Each can sync with a Google Sheet or a spreadsheet file.
      </p>
      {ledgers.error && <Alert variant="danger">{ledgers.error}</Alert>}
      {creating && <LedgerForm ledger={null} onDone={() => setCreating(false)} />}
      {ledgers.loading ? (
        <Loading />
      ) : ledgers.items.length === 0 ? (
        <Card body className="text-secondary">
          {isLandlord ? 'No ledgers yet.' : 'No ledgers have been shared with you yet.'}
        </Card>
      ) : (
        <Row className="g-3">
          {[...ledgers.items]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((ledger) => {
              const { total = 0, pending = 0 } = totals.get(ledger.id) ?? {}
              return (
                <Col md={6} lg={4} key={ledger.id}>
                  <Card as={Link} to={`/ledgers/${ledger.id}`} className="h-100 text-reset text-decoration-none">
                    <Card.Body>
                      <div className="d-flex justify-content-between gap-2">
                        <strong>{ledger.name}</strong>
                        <span>
                          {ledger.sheet && <i className="bi bi-file-earmark-spreadsheet text-success" title="Linked to Google Sheets" />}
                          {pending > 0 && (
                            <Badge bg="warning" text="dark" className="ms-1">
                              {pending} pending
                            </Badge>
                          )}
                        </span>
                      </div>
                      <div className="small text-secondary mb-2">
                        {ledger.tenantId ? `Tenant: ${memberName(ledger.tenantId)}` : 'Landlords only'}
                      </div>
                      <div className="stat-value">
                        <Money cents={total} />
                      </div>
                      {ledger.targetCents ? (
                        <>
                          <ProgressBar
                            className="mt-2"
                            now={Math.min(100, (total / ledger.targetCents) * 100)}
                            variant={total >= ledger.targetCents ? 'success' : undefined}
                          />
                          <div className="small text-secondary mt-1">
                            of <Money cents={ledger.targetCents} noConvert /> ·{' '}
                            {Math.round((total / ledger.targetCents) * 100)}%
                          </div>
                        </>
                      ) : null}
                    </Card.Body>
                  </Card>
                </Col>
              )
            })}
        </Row>
      )}
    </>
  )
}

export function LedgerForm({ ledger, onDone }: { ledger: Ledger | null; onDone: (id?: string) => void }) {
  const navigate = useNavigate()
  const { email } = useAuth()
  const { household, members } = useActiveHousehold()
  const [name, setName] = useState(ledger?.name ?? '')
  const [tenantId, setTenantId] = useState(ledger?.tenantId ?? '')
  const [targetText, setTargetText] = useState(centsToInput(ledger?.targetCents))
  const [description, setDescription] = useState(ledger?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const tenants = members.filter((m) => m.role === 'tenant')
  const chosen = tenantId ? household.members[tenantId] : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    const targetCents = targetText.trim() ? parseMoney(targetText) : undefined
    if (targetCents === null) return setError('Target amount looks wrong')
    setSaving(true)
    setError(null)
    try {
      const id = await saveLedger(household, {
        id: ledger?.id,
        name: name.trim(),
        tenantId: tenantId || undefined,
        targetCents,
        description: description.trim() || undefined,
        sheet: ledger?.sheet,
        createdBy: ledger?.createdBy ?? email,
        createdAt: ledger?.createdAt ?? Date.now(),
      })
      if (ledger) onDone(id)
      else navigate(`/ledgers/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        <Form onSubmit={submit}>
          <Row className="g-2">
            <Col md={4}>
              <Form.Label className="small">Name</Form.Label>
              <Form.Control required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car purchase" />
            </Col>
            <Col md={4}>
              <Form.Label className="small">Tenant</Form.Label>
              <Form.Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">None – landlords only</option>
                {tenants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Form.Select>
              {chosen && !chosen.email && (
                <Form.Text className="text-warning">{chosen.name} has no sign-in email, so they can't see it yet.</Form.Text>
              )}
            </Col>
            <Col md={4}>
              <Form.Label className="small">Target (optional)</Form.Label>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control inputMode="decimal" value={targetText} onChange={(e) => setTargetText(e.target.value)} />
              </InputGroup>
            </Col>
            <Col xs={12}>
              <Form.Control
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Col>
          </Row>
          {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
          <div className="d-flex gap-2 mt-2">
            <Button type="submit" disabled={saving}>
              {ledger ? 'Save' : 'Create ledger'}
            </Button>
            <Button variant="outline-secondary" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}
