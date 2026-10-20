import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Form, InputGroup, ListGroup, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useRent } from '../hooks/useRent'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import { formatDate, todayISO } from '../lib/dates'
import { rentOn } from '../lib/rent'
import { reviewRentEntry } from '../services/rent'
import type { RentEntry } from '../types'

export function Rent() {
  const { isLandlord, me, members, memberName } = useActiveHousehold()
  const { tenancies, entries, statements, loading, error } = useRent()

  // Tenants only ever see their own statement.
  if (!isLandlord) return me ? <Navigate to={`/rent/${me.id}`} replace /> : <Alert variant="warning">You're not a member of this household.</Alert>
  if (loading) return <Loading />

  const today = todayISO()
  const tenants = members.filter((m) => m.role === 'tenant')
  const pending = entries.filter((e) => e.status === 'pending').sort((a, b) => a.date.localeCompare(b.date))
  const totalOutstanding = [...statements.values()].reduce((sum, s) => sum + Math.max(0, s.outstandingCents), 0)

  return (
    <>
      <PageHeader title="Rent" icon="house-check" />
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="mb-3">
        <Card.Body className="d-flex flex-wrap gap-4">
          <div>
            <div className="small text-secondary">Outstanding (all tenants)</div>
            <div className={`stat-value ${totalOutstanding > 0 ? 'text-danger' : 'text-success'}`}>
              <Money cents={totalOutstanding} />
            </div>
          </div>
          <div>
            <div className="small text-secondary">Monthly rent roll</div>
            <div className="stat-value">
              <Money cents={tenancies.filter((t) => !t.endDate || t.endDate >= today).reduce((sum, t) => sum + rentOn(t.schedule, today), 0)} />
            </div>
          </div>
        </Card.Body>
      </Card>

      {pending.length > 0 && (
        <Card className="mb-3 border border-warning">
          <Card.Header className="bg-warning-subtle">
            <strong>Payments to confirm</strong>
          </Card.Header>
          <ListGroup variant="flush">
            {pending.map((e) => (
              <PendingPayment key={e.id} entry={e} tenantName={memberName(e.memberId)} />
            ))}
          </ListGroup>
        </Card>
      )}

      <Card>
        <div className="table-responsive">
          <Table hover className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Tenant</th>
                <th className="text-end">Monthly</th>
                <th className="text-end">Outstanding</th>
                <th className="d-none d-md-table-cell">Next due</th>
                <th className="d-none d-md-table-cell">Last payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-secondary">
                    No tenants yet – add them under <Link to="/household">Household</Link>.
                  </td>
                </tr>
              )}
              {tenants.map((m) => {
                const tenancy = tenancies.find((t) => t.memberId === m.id)
                const statement = statements.get(m.id)
                const lastPayment = entries
                  .filter((e) => e.memberId === m.id && e.kind === 'payment' && e.status === 'confirmed')
                  .sort((a, b) => b.date.localeCompare(a.date))[0]
                const waiting = pending.filter((e) => e.memberId === m.id).length
                return (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/rent/${m.id}`}>{m.name}</Link>
                      {m.room && <span className="text-secondary small"> · {m.room}</span>}
                      {waiting > 0 && (
                        <Badge bg="warning" text="dark" className="ms-1">
                          {waiting} pending
                        </Badge>
                      )}
                    </td>
                    {tenancy && statement ? (
                      <>
                        <td className="text-end">
                          <Money cents={rentOn(tenancy.schedule, today)} noConvert />
                        </td>
                        <td className={`text-end ${statement.outstandingCents > 0 ? 'text-danger fw-semibold' : 'text-success'}`}>
                          {statement.outstandingCents < 0 ? (
                            <>
                              <Money cents={-statement.outstandingCents} /> credit
                            </>
                          ) : (
                            <Money cents={statement.outstandingCents} />
                          )}
                        </td>
                        <td className="d-none d-md-table-cell small">
                          {statement.nextDue ? (
                            <>
                              {formatDate(statement.nextDue.date)} · <Money cents={statement.nextDue.amountCents} noConvert />
                            </>
                          ) : (
                            <span className="text-secondary">tenancy ended</span>
                          )}
                        </td>
                        <td className="d-none d-md-table-cell small">
                          {lastPayment ? (
                            <>
                              {formatDate(lastPayment.date)} · <Money cents={lastPayment.amountCents} noConvert />
                            </>
                          ) : (
                            <span className="text-secondary">none</span>
                          )}
                        </td>
                        <td className="text-end">
                          <Link to={`/rent/${m.id}`} className="btn btn-sm btn-outline-primary">
                            Statement
                          </Link>
                        </td>
                      </>
                    ) : (
                      <>
                        <td colSpan={4} className="text-secondary small">
                          Rent not set up
                        </td>
                        <td className="text-end">
                          <Link to={`/rent/${m.id}?setup=1`} className="btn btn-sm btn-primary">
                            Set up rent
                          </Link>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  )
}

export function PendingPayment({ entry, tenantName }: { entry: RentEntry; tenantName: string }) {
  const { email } = useAuth()
  const { household } = useActiveHousehold()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const review = async (status: 'confirmed' | 'rejected') => {
    if (!email) return
    setError(null)
    try {
      await reviewRentEntry(household.id, entry.id, status, email, reason.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <ListGroup.Item>
      <div className="d-flex flex-wrap justify-content-between gap-2">
        <div>
          <strong>{tenantName}</strong> paid <Money cents={entry.amountCents} />
          <div className="small text-secondary">
            {formatDate(entry.date)}
            {entry.note && ` · ${entry.note}`}
          </div>
        </div>
        {!rejecting && (
          <div className="d-flex gap-2 align-items-start">
            <Button size="sm" variant="success" onClick={() => void review('confirmed')}>
              Confirm
            </Button>
            <Button size="sm" variant="outline-danger" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}
      </div>
      <ReceiptPicker value={entry.receiptIds} readOnly label="" />
      {rejecting && (
        <InputGroup size="sm" className="mt-2">
          <Form.Control placeholder="Reason (shown to the tenant)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" onClick={() => void review('rejected')}>
            Reject
          </Button>
          <Button variant="outline-secondary" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </InputGroup>
      )}
      {error && <Alert variant="danger" className="mt-2 py-2 small">{error}</Alert>}
    </ListGroup.Item>
  )
}
