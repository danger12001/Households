import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import {
  SplitEditor,
  splitInputFromState,
  stateFromSplitInput,
  type SplitState,
} from '../components/SplitEditor'
import { formatDate, todayISO } from '../lib/dates'
import { titleCase } from '../lib/labels'
import { centsToInput, parseMoney } from '../lib/money'
import { resolveSplit } from '../lib/splits'
import { deleteExpense, discardReceipts, saveExpense, updateItem } from '../services/db'
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from '../types'

export function ExpenseForm() {
  const { id } = useParams()
  const { item: expense, loading } = useHouseholdDoc<Expense>('expenses', id)

  if (loading) return <Loading />
  if (id && !expense) {
    return (
      <Alert variant="warning">
        That expense no longer exists. <Link to="/expenses">Back to expenses</Link>
      </Alert>
    )
  }
  // Keyed so switching between expenses resets the form state.
  return <ExpenseEditor key={id ?? 'new'} expense={expense} />
}

function ExpenseEditor({ expense }: { expense: Expense | null }) {
  const navigate = useNavigate()
  const { email } = useAuth()
  const { household, members, me, isLandlord, memberName } = useActiveHousehold()

  const canEdit = !expense || isLandlord || (expense.createdBy === email && !expense.billId)
  const isNew = !expense

  const [description, setDescription] = useState(expense?.description ?? '')
  const [amountText, setAmountText] = useState(centsToInput(expense?.amountCents))
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'household')
  const [chosenPaidBy, setPaidBy] = useState(expense?.paidBy ?? me?.id ?? members[0]?.id ?? '')
  // Tenants can only claim what they paid themselves.
  const paidBy = isLandlord || !me ? chosenPaidBy : me.id
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [receiptIds, setReceiptIds] = useState<string[]>(expense?.receiptIds ?? [])
  const [split, setSplit] = useState<SplitState>(() =>
    expense
      ? stateFromSplitInput(expense.splitMethod, expense.splitInput)
      : { method: 'equal', values: Object.fromEntries(members.map((m) => [m.id, 1])), exactText: {} },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountCents = parseMoney(amountText)
  const preview = useMemo(() => {
    if (!amountCents) return { allocations: null, error: null }
    try {
      return { allocations: resolveSplit(split.method, amountCents, splitInputFromState(split)), error: null }
    } catch (err) {
      return { allocations: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [amountCents, split])

  const original = expense?.receiptIds ?? []

  const cancel = async () => {
    await discardReceipts(household.id, receiptIds.filter((r) => !original.includes(r)))
    navigate(-1)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    if (!amountCents) return setError('Enter an amount')
    if (!preview.allocations) return setError(preview.error ?? 'Check the split')
    setSaving(true)
    setError(null)
    try {
      const savedId = await saveExpense(household.id, {
        id: expense?.id,
        description: description.trim(),
        category,
        amountCents,
        date,
        paidBy,
        splitMethod: split.method,
        splitInput: splitInputFromState(split),
        allocations: preview.allocations,
        receiptIds,
        notes: notes.trim() || undefined,
        status: expense?.status ?? 'open',
        disputeNote: expense?.disputeNote,
        disputedBy: expense?.disputedBy,
        createdBy: expense?.createdBy ?? email,
        createdAt: expense?.createdAt ?? Date.now(),
      })
      await discardReceipts(household.id, original.filter((r) => !receiptIds.includes(r)))
      navigate(`/expenses/${savedId}`, { replace: true })
      if (!isNew) setSaving(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  if (!canEdit && expense) return <ExpenseView expense={expense} />

  return (
    <>
      <PageHeader title={isNew ? 'New expense claim' : 'Edit expense'} icon="receipt" />
      {expense?.status === 'disputed' && <DisputeBanner expense={expense} />}
      {expense?.billId && (
        <Alert variant="info">
          Generated from a <Link to={`/utilities/${expense.billId}`}>utility bill</Link>. Edit the bill to change the
          split.
        </Alert>
      )}
      <Card>
        <Card.Body>
          <Form onSubmit={submit}>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="description">
                  <Form.Label>What was it?</Form.Label>
                  <Form.Control
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Dog food, pool chlorine, router"
                  />
                </Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="amount">
                  <Form.Label>Amount</Form.Label>
                  <InputGroup>
                    <InputGroup.Text>R</InputGroup.Text>
                    <Form.Control
                      required
                      inputMode="decimal"
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      isInvalid={!!amountText && amountCents === null}
                    />
                  </InputGroup>
                  {isLandlord && amountCents ? (
                    <Form.Text>
                      <Money cents={amountCents} />
                    </Form.Text>
                  ) : null}
                </Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="date">
                  <Form.Label>Date</Form.Label>
                  <Form.Control type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group controlId="category">
                  <Form.Label>Category</Form.Label>
                  <Form.Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {titleCase(c)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group controlId="paidBy">
                  <Form.Label>Paid by</Form.Label>
                  <Form.Select value={paidBy} disabled={!isLandlord} onChange={(e) => setPaidBy(e.target.value)}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={12}>
                <SplitEditor state={split} onChange={setSplit} allocations={preview.allocations} />
                {preview.error && amountCents ? <div className="text-danger small">{preview.error}</div> : null}
              </Col>
              <Col xs={12}>
                <ReceiptPicker value={receiptIds} onChange={setReceiptIds} />
                <Form.Group controlId="notes">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control as="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Form.Group>
              </Col>
            </Row>
            {error && (
              <Alert variant="danger" className="mt-3">
                {error}
              </Alert>
            )}
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add claim' : 'Save changes'}
              </Button>
              <Button variant="outline-secondary" onClick={() => void cancel()} disabled={saving}>
                Cancel
              </Button>
              {expense && (
                <ConfirmButton
                  className="ms-auto"
                  onConfirm={async () => {
                    await deleteExpense(household.id, expense)
                    navigate('/expenses', { replace: true })
                  }}
                >
                  Delete
                </ConfirmButton>
              )}
            </div>
            {expense && (
              <p className="small text-secondary mt-3 mb-0">
                Added by {expense.createdBy} · paid by {memberName(expense.paidBy)}
              </p>
            )}
          </Form>
        </Card.Body>
      </Card>
    </>
  )
}

function DisputeBanner({ expense }: { expense: Expense }) {
  const { household, isLandlord, memberName } = useActiveHousehold()
  return (
    <Alert variant="warning" className="d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <strong>Disputed by {memberName(expense.disputedBy)}</strong>
        {expense.disputeNote && <div className="small">“{expense.disputeNote}”</div>}
        <div className="small">Left out of balances until a landlord resolves it.</div>
      </div>
      {isLandlord && (
        <Button
          size="sm"
          variant="outline-dark"
          onClick={() =>
            void updateItem(household.id, 'expenses', expense.id, {
              status: 'open',
              disputeNote: null,
              disputedBy: null,
              updatedAt: Date.now(),
            })
          }
        >
          Resolve – count it again
        </Button>
      )}
    </Alert>
  )
}

/** Read-only view for tenants looking at someone else's claim, with the option to dispute their share. */
function ExpenseView({ expense }: { expense: Expense }) {
  const navigate = useNavigate()
  const { household, me, memberName } = useActiveHousehold()
  const [disputing, setDisputing] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canDispute = !!me && expense.status === 'open' && me.id in expense.allocations && me.id !== expense.paidBy

  const dispute = async () => {
    if (!me) return
    setError(null)
    try {
      await updateItem(household.id, 'expenses', expense.id, {
        status: 'disputed',
        disputeNote: note.trim(),
        disputedBy: me.id,
        updatedAt: Date.now(),
      })
      setDisputing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <PageHeader
        title={expense.description}
        icon="receipt"
        actions={
          <Button variant="outline-secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
        }
      />
      {expense.status === 'disputed' && <DisputeBanner expense={expense} />}
      <Card>
        <Card.Body>
          <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
            <div>
              <div className="stat-value">
                <Money cents={expense.amountCents} alwaysConvert />
              </div>
              <div className="text-secondary small">
                {formatDate(expense.date)} · {titleCase(expense.category)} · paid by {memberName(expense.paidBy)}
              </div>
            </div>
            {expense.billId && (
              <div>
                <Badge bg="info">Utility bill</Badge>{' '}
                <Link to={`/utilities/${expense.billId}`} className="small">
                  View bill
                </Link>
              </div>
            )}
          </div>
          <Table size="sm">
            <thead>
              <tr>
                <th>Who</th>
                <th className="text-end">Share</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(expense.allocations).map(([id, cents]) => (
                <tr key={id} className={id === me?.id ? 'fw-semibold' : undefined}>
                  <td>{memberName(id)}</td>
                  <td className="text-end">
                    <Money cents={cents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <ReceiptPicker value={expense.receiptIds} readOnly />
          {expense.notes && <p className="mb-3">{expense.notes}</p>}
          {error && <Alert variant="danger">{error}</Alert>}
          {canDispute &&
            (disputing ? (
              <div>
                <Form.Control
                  as="textarea"
                  rows={2}
                  className="mb-2"
                  placeholder="What's wrong with this claim?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="d-flex gap-2">
                  <Button variant="warning" onClick={() => void dispute()} disabled={!note.trim()}>
                    Dispute my share
                  </Button>
                  <Button variant="outline-secondary" onClick={() => setDisputing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline-warning" onClick={() => setDisputing(true)}>
                <i className="bi bi-flag me-1" />
                Dispute
              </Button>
            ))}
        </Card.Body>
      </Card>
    </>
  )
}
