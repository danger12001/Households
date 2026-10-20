import { useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Card, Col, Form, InputGroup, ListGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { computeNet, simplifyDebts, type Transfer } from '../lib/balances'
import { formatDate, todayISO } from '../lib/dates'
import { centsToInput, parseMoney } from '../lib/money'
import { addItem, deleteItem } from '../services/db'
import type { Expense, Settlement } from '../types'

export function Balances() {
  const { email } = useAuth()
  const { household, members, me, isLandlord, memberName } = useActiveHousehold()
  const expenses = useHouseholdCollection<Expense>('expenses')
  const settlements = useHouseholdCollection<Settlement>('settlements')
  const [draft, setDraft] = useState<Transfer | null>(null)

  const net = useMemo(() => computeNet(expenses.items, settlements.items), [expenses.items, settlements.items])
  const transfers = useMemo(() => simplifyDebts(net), [net])
  const history = useMemo(
    () => [...settlements.items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [settlements.items],
  )

  if (expenses.loading || settlements.loading) return <Loading />

  // Tenants may only record payments they're part of.
  const canRecord = (t: Transfer) => isLandlord || (!!me && (t.from === me.id || t.to === me.id))

  return (
    <>
      <PageHeader
        title="Balances"
        icon="arrow-left-right"
        actions={
          <Button onClick={() => setDraft({ from: me?.id ?? members[0].id, to: '', amountCents: 0 })}>
            <i className="bi bi-cash-coin me-1" />
            Record a payment
          </Button>
        }
      />
      {(expenses.error || settlements.error) && <Alert variant="danger">{expenses.error ?? settlements.error}</Alert>}
      {draft && <SettlementForm initial={draft} onDone={() => setDraft(null)} />}

      <Row className="g-3">
        <Col lg={6}>
          <Card className="mb-3">
            <Card.Header className="bg-white">
              <strong>Who's owed what</strong>
            </Card.Header>
            <Table className="mb-0 align-middle">
              <tbody>
                {members.map((m) => {
                  const value = net[m.id] ?? 0
                  return (
                    <tr key={m.id} className={m.id === me?.id ? 'fw-semibold' : undefined}>
                      <td>{m.name}</td>
                      <td className={`text-end ${value < 0 ? 'text-danger' : value > 0 ? 'text-success' : 'text-secondary'}`}>
                        {value === 0 ? 'settled' : (
                          <>
                            {value > 0 ? 'is owed ' : 'owes '}
                            <Money cents={Math.abs(value)} />
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
          <Card>
            <Card.Header className="bg-white">
              <strong>Suggested payments</strong>
              <div className="small text-secondary">The fewest payments that settle everyone up.</div>
            </Card.Header>
            <ListGroup variant="flush">
              {transfers.length === 0 && <ListGroup.Item className="text-secondary">Everyone is settled up.</ListGroup.Item>}
              {transfers.map((t) => (
                <ListGroup.Item key={`${t.from}-${t.to}`} className="d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <strong>{memberName(t.from)}</strong> pays <strong>{memberName(t.to)}</strong>
                    <div>
                      <Money cents={t.amountCents} />
                    </div>
                  </div>
                  {canRecord(t) && (
                    <Button size="sm" variant="outline-primary" onClick={() => setDraft(t)}>
                      Mark paid
                    </Button>
                  )}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
        <Col lg={6}>
          <Card>
            <Card.Header className="bg-white">
              <strong>Payment history</strong>
            </Card.Header>
            <ListGroup variant="flush">
              {history.length === 0 && <ListGroup.Item className="text-secondary">No payments recorded yet.</ListGroup.Item>}
              {history.map((s) => (
                <ListGroup.Item key={s.id} className="d-flex justify-content-between align-items-center gap-2">
                  <div>
                    {memberName(s.from)} → {memberName(s.to)} <Money cents={s.amountCents} />
                    <div className="small text-secondary">
                      {formatDate(s.date)}
                      {s.note && ` · ${s.note}`}
                    </div>
                  </div>
                  {(isLandlord || s.createdBy === email) && (
                    <ConfirmButton size="sm" confirmLabel="Delete" onConfirm={() => deleteItem(household.id, 'settlements', s.id)}>
                      <i className="bi bi-trash" />
                    </ConfirmButton>
                  )}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </>
  )
}

function SettlementForm({ initial, onDone }: { initial: Transfer; onDone: () => void }) {
  const { email } = useAuth()
  const { household, members, me, isLandlord } = useActiveHousehold()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to || members.find((m) => m.id !== initial.from)?.id || '')
  const [amountText, setAmountText] = useState(initial.amountCents ? centsToInput(initial.amountCents) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amountCents = parseMoney(amountText)
    if (!amountCents) return setError('Enter an amount')
    if (from === to) return setError('Choose two different people')
    if (!isLandlord && me && from !== me.id && to !== me.id) return setError('You can only record payments you made or received')
    if (!email) return
    setSaving(true)
    setError(null)
    try {
      await addItem<Settlement>(household.id, 'settlements', {
        from,
        to,
        amountCents,
        date,
        note: note.trim() || undefined,
        createdBy: email,
        createdAt: Date.now(),
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
        <Form onSubmit={submit}>
          <Row className="g-2 align-items-end">
            <Col xs={6} md={3}>
              <Form.Label>From</Form.Label>
              <Form.Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={3}>
              <Form.Label>To</Form.Label>
              <Form.Select value={to} onChange={(e) => setTo(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label>Amount</Form.Label>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control required inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
              </InputGroup>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Col>
            <Col xs={12} md={2}>
              <Form.Control placeholder="Note (EFT ref…)" value={note} onChange={(e) => setNote(e.target.value)} />
            </Col>
          </Row>
          {error && (
            <Alert variant="danger" className="mt-2 mb-0 py-2">
              {error}
            </Alert>
          )}
          <div className="d-flex gap-2 mt-2">
            <Button type="submit" disabled={saving}>
              Save payment
            </Button>
            <Button variant="outline-secondary" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}
