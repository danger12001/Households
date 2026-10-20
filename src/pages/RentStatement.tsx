import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, ButtonGroup, Card, Col, Form, InputGroup, ListGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useRent } from '../hooks/useRent'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import { formatDate, todayISO } from '../lib/dates'
import { rentOn } from '../lib/rent'
import { centsToInput, parseMoney } from '../lib/money'
import { discardReceipts } from '../services/db'
import { addRentEntry, deleteRentEntry, saveTenancy } from '../services/rent'
import type { Member, RentEntry, RentEntryKind, Tenancy } from '../types'
import { PendingPayment } from './Rent'

export function RentStatementPage() {
  const { memberId } = useParams()
  const [params] = useSearchParams()
  const { household, isLandlord, me } = useActiveHousehold()
  const { tenancies, entries, statements, loading, error } = useRent()
  const [editing, setEditing] = useState(params.get('setup') === '1')
  const [adding, setAdding] = useState(false)

  const member = memberId ? household.members[memberId] : undefined
  if (!member || (!isLandlord && member.id !== me?.id)) {
    return (
      <Alert variant="warning">
        Rent statement not found. <Link to="/">Home</Link>
      </Alert>
    )
  }
  if (loading) return <Loading />

  const tenancy = tenancies.find((t) => t.memberId === member.id)
  const statement = statements.get(member.id)
  const own = entries.filter((e) => e.memberId === member.id)
  const pending = own.filter((e) => e.status === 'pending')
  const rejected = own.filter((e) => e.status === 'rejected')
  const entryById = new Map(own.map((e) => [e.id, e]))
  const today = todayISO()

  return (
    <>
      <PageHeader
        title={isLandlord ? `Rent – ${member.name}` : 'My rent'}
        icon="house-check"
        actions={
          <>
            {isLandlord && (
              <Link to="/rent" className="btn btn-outline-secondary">
                All tenants
              </Link>
            )}
            {isLandlord && tenancy && !editing && (
              <Button variant="outline-secondary" onClick={() => setEditing(true)}>
                Rent terms
              </Button>
            )}
          </>
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}

      {isLandlord && (editing || !tenancy) && (
        <TenancyForm member={member} tenancy={tenancy} onDone={() => setEditing(false)} />
      )}

      {!tenancy || !statement ? (
        !isLandlord && <Alert variant="info">Your landlord hasn't set up your rent in House Hub yet.</Alert>
      ) : (
        <>
          <Row className="g-3 mb-3">
            <Col md={8}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-wrap gap-4">
                  <div>
                    <div className="small text-secondary">{statement.outstandingCents < 0 ? 'In credit' : 'Outstanding'}</div>
                    <div className={`stat-value ${statement.outstandingCents > 0 ? 'text-danger' : 'text-success'}`}>
                      <Money cents={Math.abs(statement.outstandingCents)} />
                    </div>
                  </div>
                  <div>
                    <div className="small text-secondary">Monthly rent</div>
                    <div className="stat-value">
                      <Money cents={rentOn(tenancy.schedule, today)} noConvert />
                    </div>
                    <div className="small text-secondary">due on day {tenancy.dueDay}</div>
                  </div>
                  <div>
                    <div className="small text-secondary">Next due</div>
                    {statement.nextDue ? (
                      <>
                        <div className="stat-value">{formatDate(statement.nextDue.date)}</div>
                        <div className="small">
                          <Money cents={statement.nextDue.amountCents} noConvert />
                        </div>
                      </>
                    ) : (
                      <div className="text-secondary">Tenancy ended {tenancy.endDate && formatDate(tenancy.endDate)}</div>
                    )}
                  </div>
                  {tenancy.depositCents ? (
                    <div>
                      <div className="small text-secondary">Deposit held</div>
                      <div className="stat-value">
                        <Money cents={tenancy.depositCents} noConvert />
                      </div>
                    </div>
                  ) : null}
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-column justify-content-center gap-2">
                  {!adding && (
                    <Button onClick={() => setAdding(true)}>
                      <i className="bi bi-cash-coin me-1" />
                      {isLandlord ? 'Record payment / adjustment' : "I've paid"}
                    </Button>
                  )}
                  <div className="small text-secondary">
                    Charged <Money cents={statement.chargedCents} noConvert /> · paid{' '}
                    <Money cents={statement.paidCents} noConvert />
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {adding && <RentEntryForm member={member} onDone={() => setAdding(false)} />}

          {pending.length > 0 && (
            <Card className="mb-3 border border-warning">
              <Card.Header className="bg-warning-subtle">
                <strong>{isLandlord ? 'Payments to confirm' : 'Waiting for your landlord to confirm'}</strong>
              </Card.Header>
              <ListGroup variant="flush">
                {pending.map((e) =>
                  isLandlord ? (
                    <PendingPayment key={e.id} entry={e} tenantName={member.name} />
                  ) : (
                    <OwnRequest key={e.id} entry={e} />
                  ),
                )}
              </ListGroup>
            </Card>
          )}

          <Card className="mb-3">
            <Card.Header className="bg-white">
              <strong>Statement</strong>
            </Card.Header>
            <div className="table-responsive">
              <Table size="sm" className="mb-0 align-middle small">
                <thead>
                  <tr>
                    <th className="ps-3">Date</th>
                    <th>Description</th>
                    <th className="text-end">Amount</th>
                    <th className="text-end pe-3">Balance</th>
                    {isLandlord && <th />}
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="ps-3 text-secondary">
                        Nothing due yet – the first rent falls due on {statement.nextDue ? formatDate(statement.nextDue.date) : '–'}.
                      </td>
                    </tr>
                  )}
                  {[...statement.lines].reverse().map((line, i) => {
                    const entry = line.entryId ? entryById.get(line.entryId) : undefined
                    return (
                      <tr key={line.entryId ?? `rent-${line.date}-${i}`}>
                        <td className="ps-3 text-nowrap">{formatDate(line.date)}</td>
                        <td>
                          {line.description}
                          {entry && entry.receiptIds.length > 0 && <ReceiptPicker value={entry.receiptIds} readOnly label="" />}
                        </td>
                        <td className={`text-end ${line.amountCents < 0 ? 'text-success' : ''}`}>
                          {line.amountCents < 0 ? '−' : ''}
                          <Money cents={Math.abs(line.amountCents)} noConvert />
                        </td>
                        <td className={`text-end pe-3 ${line.balanceCents > 0 ? 'text-danger' : ''}`}>
                          <Money cents={line.balanceCents} noConvert />
                        </td>
                        {isLandlord && (
                          <td className="text-end pe-2">
                            {entry && (
                              <ConfirmButton
                                size="sm"
                                confirmLabel="Delete"
                                onConfirm={async () => {
                                  await deleteRentEntry(household.id, entry.id)
                                  await discardReceipts(household.id, entry.receiptIds)
                                }}
                              >
                                <i className="bi bi-trash" />
                              </ConfirmButton>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          </Card>

          {rejected.length > 0 && (
            <Card className="mb-3">
              <Card.Header className="bg-white">
                <strong>Rejected payments</strong>
              </Card.Header>
              <ListGroup variant="flush">
                {rejected.map((e) => (
                  <OwnRequest key={e.id} entry={e} />
                ))}
              </ListGroup>
            </Card>
          )}

          {tenancy.schedule.length > 1 && (
            <Card className="mb-3">
              <Card.Header className="bg-white">
                <strong>Rent history</strong>
              </Card.Header>
              <ListGroup variant="flush">
                {[...tenancy.schedule].reverse().map((s) => (
                  <ListGroup.Item key={s.from} className="d-flex justify-content-between small">
                    <span>From {formatDate(s.from)}</span>
                    <Money cents={s.amountCents} noConvert />
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          )}
        </>
      )}
    </>
  )
}

/** A payment the tenant reported: shows status, and lets them withdraw it until confirmed. */
function OwnRequest({ entry }: { entry: RentEntry }) {
  const { email } = useAuth()
  const { household, isLandlord } = useActiveHousehold()
  return (
    <ListGroup.Item className="d-flex flex-wrap justify-content-between gap-2">
      <div>
        <Money cents={entry.amountCents} /> on {formatDate(entry.date)}
        {entry.note && <span className="text-secondary"> · {entry.note}</span>}
        {entry.status === 'pending' ? (
          <Badge bg="warning" text="dark" className="ms-2">
            pending
          </Badge>
        ) : (
          <div className="small text-danger">Rejected{entry.rejectReason ? `: ${entry.rejectReason}` : ''}</div>
        )}
        <ReceiptPicker value={entry.receiptIds} readOnly label="" />
      </div>
      {(isLandlord || entry.createdBy === email) && (
        <ConfirmButton
          size="sm"
          confirmLabel={entry.status === 'pending' ? 'Withdraw' : 'Delete'}
          onConfirm={async () => {
            await deleteRentEntry(household.id, entry.id)
            await discardReceipts(household.id, entry.receiptIds)
          }}
        >
          <i className="bi bi-trash" />
        </ConfirmButton>
      )}
    </ListGroup.Item>
  )
}

function RentEntryForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const { email } = useAuth()
  const { household, isLandlord } = useActiveHousehold()
  const [kind, setKind] = useState<RentEntryKind>('payment')
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [receiptIds, setReceiptIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    const amountCents = parseMoney(amountText)
    if (!amountCents) return setError('Enter an amount')
    setSaving(true)
    setError(null)
    try {
      const now = Date.now()
      await addRentEntry(household.id, {
        memberId: member.id,
        tenantEmail: member.email,
        kind: isLandlord ? kind : 'payment',
        amountCents,
        date,
        note: note.trim() || undefined,
        receiptIds,
        status: isLandlord ? 'confirmed' : 'pending',
        createdBy: email,
        createdAt: now,
        ...(isLandlord ? { reviewedBy: email, reviewedAt: now } : {}),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        {!isLandlord && (
          <p className="small text-secondary">
            Your landlord confirms the payment before it comes off your balance. A screenshot of the EFT/proof of
            payment helps.
          </p>
        )}
        <Form onSubmit={submit}>
          <Row className="g-2">
            {isLandlord && (
              <Col xs={12} md={5}>
                <ButtonGroup className="w-100">
                  {(['payment', 'charge', 'credit'] as const).map((k) => (
                    <Button key={k} variant={kind === k ? 'primary' : 'outline-primary'} onClick={() => setKind(k)}>
                      {k === 'payment' ? 'Payment' : k === 'charge' ? 'Charge' : 'Credit'}
                    </Button>
                  ))}
                </ButtonGroup>
                <Form.Text>
                  {kind === 'payment'
                    ? 'Money received from the tenant.'
                    : kind === 'charge'
                      ? 'Adds to what they owe (deposit, late fee, partial first month…).'
                      : 'Reduces what they owe (discount, repair they paid for…).'}
                </Form.Text>
              </Col>
            )}
            <Col xs={6} md={isLandlord ? 3 : 4}>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control
                  required
                  inputMode="decimal"
                  placeholder="Amount"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col xs={6} md={isLandlord ? 4 : 4}>
              <Form.Control type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Col>
            <Col xs={12} md={isLandlord ? 12 : 4}>
              <Form.Control placeholder="Note (EFT ref, what it's for…)" value={note} onChange={(e) => setNote(e.target.value)} />
            </Col>
          </Row>
          <div className="mt-2">
            <ReceiptPicker value={receiptIds} onChange={setReceiptIds} label="Proof of payment (optional)" />
          </div>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          <div className="d-flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isLandlord ? 'Save' : 'Send to landlord'}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={async () => {
                await discardReceipts(household.id, receiptIds)
                onDone()
              }}
            >
              Cancel
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}

function TenancyForm({ member, tenancy, onDone }: { member: Member; tenancy?: Tenancy; onDone: () => void }) {
  const { household } = useActiveHousehold()
  const today = todayISO()
  const current = tenancy ? rentOn(tenancy.schedule, today) : undefined
  const [rentText, setRentText] = useState(centsToInput(current))
  const [effectiveFrom, setEffectiveFrom] = useState(tenancy ? today : (member.moveIn ?? today))
  const [dueDay, setDueDay] = useState(tenancy?.dueDay ?? 1)
  const [startDate, setStartDate] = useState(tenancy?.startDate ?? member.moveIn ?? today)
  const [endDate, setEndDate] = useState(tenancy?.endDate ?? member.moveOut ?? '')
  const [depositText, setDepositText] = useState(centsToInput(tenancy?.depositCents))
  const [notes, setNotes] = useState(tenancy?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rentCents = parseMoney(rentText)
  const rentChanged = !!tenancy && rentCents !== null && rentCents !== current

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!rentCents) return setError('Enter the monthly rent')
    const depositCents = depositText.trim() ? parseMoney(depositText) : undefined
    if (depositCents === null) return setError('Deposit amount looks wrong')
    if (endDate && endDate < startDate) return setError('End date is before the start date')

    let schedule = tenancy?.schedule ?? []
    if (!tenancy) {
      schedule = [{ from: startDate, amountCents: rentCents }]
    } else if (rentChanged) {
      // Keep history: replace any step on/after the effective date, then add the new amount.
      schedule = [...schedule.filter((s) => s.from < effectiveFrom), { from: effectiveFrom, amountCents: rentCents }]
    }
    // The first step always covers the start of the tenancy.
    schedule = [...schedule].sort((a, b) => a.from.localeCompare(b.from))
    if (schedule[0].from > startDate) schedule[0] = { ...schedule[0], from: startDate }

    setSaving(true)
    setError(null)
    try {
      await saveTenancy(household, {
        memberId: member.id,
        dueDay,
        startDate,
        endDate: endDate || undefined,
        schedule,
        depositCents,
        notes: notes.trim() || undefined,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        <h2 className="h6">{tenancy ? 'Rent terms' : `Set up rent for ${member.name}`}</h2>
        {!member.email && (
          <Alert variant="warning" className="py-2 small">
            {member.name} has no sign-in email, so they won't be able to see their statement.
          </Alert>
        )}
        <Form onSubmit={submit}>
          <Row className="g-2">
            <Col xs={6} md={3}>
              <Form.Label className="small">Monthly rent</Form.Label>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control required inputMode="decimal" value={rentText} onChange={(e) => setRentText(e.target.value)} />
              </InputGroup>
            </Col>
            {rentChanged && (
              <Col xs={6} md={3}>
                <Form.Label className="small">New rent applies from</Form.Label>
                <Form.Control type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Col>
            )}
            <Col xs={6} md={2}>
              <Form.Label className="small">Due day</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={31}
                required
                value={dueDay}
                onChange={(e) => setDueDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              />
            </Col>
            <Col xs={6} md={tenancy ? 2 : 3}>
              <Form.Label className="small">Rent starts</Form.Label>
              <Form.Control type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small">Ends (optional)</Form.Label>
              <Form.Control type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Col>
            <Col xs={6} md={3}>
              <Form.Label className="small">Deposit held (optional)</Form.Label>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control inputMode="decimal" value={depositText} onChange={(e) => setDepositText(e.target.value)} />
              </InputGroup>
            </Col>
            <Col xs={12} md={9}>
              <Form.Label className="small">Notes</Form.Label>
              <Form.Control value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lease terms, escalation date…" />
            </Col>
          </Row>
          <Form.Text>
            Rent is charged on the due day each month from the first due date on/after the start. Add a one-off
            charge for a partial first month or for the deposit if the tenant still owes it.
          </Form.Text>
          {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
          <div className="d-flex gap-2 mt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save rent terms'}
            </Button>
            {tenancy && (
              <Button variant="outline-secondary" onClick={onDone}>
                Cancel
              </Button>
            )}
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}
