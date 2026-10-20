import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Form, InputGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import { allocateBill, daysResident } from '../lib/billSplit'
import { addDays, addMonths, formatDate, todayISO } from '../lib/dates'
import { BILL_SPLIT_LABELS, titleCase, UTILITY_ICONS } from '../lib/labels'
import { centsToInput, parseMoney } from '../lib/money'
import { deleteBill, discardReceipts, saveBill } from '../services/db'
import { UTILITIES, type Bill, type BillSplitMethod, type Utility } from '../types'

export function BillForm() {
  const { id } = useParams()
  const { item, loading } = useHouseholdDoc<Bill>('bills', id)
  if (loading) return <Loading />
  if (id && !item) {
    return (
      <Alert variant="warning">
        That bill no longer exists. <Link to="/utilities">Back to utilities</Link>
      </Alert>
    )
  }
  return <BillEditor key={id ?? 'new'} bill={item} />
}

function BillEditor({ bill }: { bill: Bill | null }) {
  const navigate = useNavigate()
  const { email } = useAuth()
  const { household, members, me, isLandlord, memberName } = useActiveHousehold()

  const defaultEnd = todayISO()
  const [utility, setUtility] = useState<Utility>(bill?.utility ?? 'electricity')
  const [periodStart, setPeriodStart] = useState(bill?.periodStart ?? addDays(addMonths(defaultEnd, -1), 1))
  const [periodEnd, setPeriodEnd] = useState(bill?.periodEnd ?? defaultEnd)
  const [amountText, setAmountText] = useState(centsToInput(bill?.amountCents))
  const [paidBy, setPaidBy] = useState(bill?.paidBy ?? me?.id ?? members[0].id)
  const [splitMethod, setSplitMethod] = useState<BillSplitMethod>(bill?.splitMethod ?? 'occupancy')
  const [participants, setParticipants] = useState<string[]>(
    bill?.participants ?? members.filter((m) => m.sharesUtilities).map((m) => m.id),
  )
  const [usage, setUsage] = useState<Record<string, number>>(bill?.usage ?? {})
  const [consumption, setConsumption] = useState(bill?.consumption?.toString() ?? '')
  const [unit, setUnit] = useState(bill?.unit ?? 'kWh')
  const [receiptIds, setReceiptIds] = useState<string[]>(bill?.receiptIds ?? [])
  const [notes, setNotes] = useState(bill?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountCents = parseMoney(amountText)
  const preview = useMemo(() => {
    if (!amountCents) return { allocations: null, error: null }
    try {
      return {
        allocations: allocateBill(
          { amountCents, splitMethod, participants, usage, periodStart, periodEnd },
          household.members,
        ),
        error: null,
      }
    } catch (err) {
      return { allocations: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [amountCents, splitMethod, participants, usage, periodStart, periodEnd, household.members])

  if (!isLandlord && bill) {
    return (
      <>
        <PageHeader
          title={`${titleCase(bill.utility)} bill`}
          icon={UTILITY_ICONS[bill.utility]}
          actions={
            <Button variant="outline-secondary" onClick={() => navigate(-1)}>
              Back
            </Button>
          }
        />
        <Card>
          <Card.Body>
            <div className="stat-value">
              <Money cents={bill.amountCents} />
            </div>
            <p className="text-secondary small">
              {formatDate(bill.periodStart)} – {formatDate(bill.periodEnd)} · paid by {memberName(bill.paidBy)} · split{' '}
              {BILL_SPLIT_LABELS[bill.splitMethod].toLowerCase()}
              {bill.consumption ? ` · ${bill.consumption} ${bill.unit ?? ''} used` : ''}
            </p>
            {bill.expenseId && <BillExpenseShares expenseId={bill.expenseId} />}
            <ReceiptPicker value={bill.receiptIds} readOnly label="Bill" />
            {bill.notes && <p>{bill.notes}</p>}
          </Card.Body>
        </Card>
      </>
    )
  }

  const original = bill?.receiptIds ?? []

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    if (!amountCents) return setError('Enter the bill amount')
    if (!preview.allocations) return setError(preview.error ?? 'Check the split')
    setSaving(true)
    setError(null)
    try {
      const consumptionValue = consumption ? Number(consumption.replace(',', '.')) : undefined
      await saveBill(
        household.id,
        {
          id: bill?.id,
          utility,
          periodStart,
          periodEnd,
          amountCents,
          paidBy,
          splitMethod,
          participants,
          usage: splitMethod === 'usage' ? usage : {},
          consumption: Number.isFinite(consumptionValue) ? consumptionValue : undefined,
          unit: consumption ? unit : undefined,
          receiptIds,
          expenseId: bill?.expenseId,
          notes: notes.trim() || undefined,
          createdBy: bill?.createdBy ?? email,
          createdAt: bill?.createdAt ?? Date.now(),
        },
        preview.allocations,
      )
      await discardReceipts(household.id, original.filter((r) => !receiptIds.includes(r)))
      navigate('/utilities')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const toggle = (id: string, on: boolean) =>
    setParticipants(on ? [...participants, id] : participants.filter((p) => p !== id))

  return (
    <>
      <PageHeader title={bill ? 'Edit bill' : 'Add utility bill'} icon="lightning-charge" />
      <Card>
        <Card.Body>
          <Form onSubmit={submit}>
            <ReceiptPicker value={receiptIds} onChange={setReceiptIds} label="Photo / screenshot of the bill" />
            <Row className="g-3">
              <Col xs={6} md={3}>
                <Form.Group controlId="utility">
                  <Form.Label>Utility</Form.Label>
                  <Form.Select
                    value={utility}
                    onChange={(e) => {
                      const next = e.target.value as Utility
                      setUtility(next)
                      if (next === 'water' || next === 'sewerage') setUnit('kL')
                      if (next === 'electricity') setUnit('kWh')
                    }}
                  >
                    {UTILITIES.map((u) => (
                      <option key={u} value={u}>
                        {titleCase(u)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="amount">
                  <Form.Label>Amount</Form.Label>
                  <InputGroup>
                    <InputGroup.Text>R</InputGroup.Text>
                    <Form.Control required inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
                  </InputGroup>
                  {amountCents ? (
                    <Form.Text>
                      <Money cents={amountCents} />
                    </Form.Text>
                  ) : null}
                </Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="periodStart">
                  <Form.Label>Period from</Form.Label>
                  <Form.Control type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="periodEnd">
                  <Form.Label>Period to</Form.Label>
                  <Form.Control type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </Form.Group>
              </Col>
              <Col xs={6} md={4}>
                <Form.Group controlId="paidBy">
                  <Form.Label>Paid by</Form.Label>
                  <Form.Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={6} md={4}>
                <Form.Group controlId="consumption">
                  <Form.Label>Usage on bill (optional)</Form.Label>
                  <InputGroup>
                    <Form.Control inputMode="decimal" value={consumption} onChange={(e) => setConsumption(e.target.value)} />
                    <Form.Control style={{ maxWidth: '5rem' }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
                  </InputGroup>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="splitMethod">
                  <Form.Label>Split</Form.Label>
                  <Form.Select value={splitMethod} onChange={(e) => setSplitMethod(e.target.value as BillSplitMethod)}>
                    {(Object.keys(BILL_SPLIT_LABELS) as BillSplitMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {BILL_SPLIT_LABELS[m]}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <Table size="sm" className="align-middle mt-3">
              <thead>
                <tr>
                  <th>Who shares this bill</th>
                  <th className="text-end">
                    {splitMethod === 'usage'
                      ? `Sub-meter ${unit}`
                      : splitMethod === 'occupancy'
                        ? 'Days × weight'
                        : splitMethod === 'weights'
                          ? 'Weight'
                          : ''}
                  </th>
                  <th className="text-end">Share</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const included = participants.includes(m.id)
                  return (
                    <tr key={m.id}>
                      <td>
                        <Form.Check
                          id={`p-${m.id}`}
                          label={m.name}
                          checked={included}
                          onChange={(e) => toggle(m.id, e.target.checked)}
                        />
                      </td>
                      <td className="text-end" style={{ width: '9rem' }}>
                        {included && splitMethod === 'usage' && (
                          <Form.Control
                            size="sm"
                            inputMode="decimal"
                            value={usage[m.id] ?? ''}
                            onChange={(e) => setUsage({ ...usage, [m.id]: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        )}
                        {included && splitMethod === 'occupancy' && (
                          <span className="small text-secondary">
                            {daysResident(m, periodStart, periodEnd)} × {m.weight}
                          </span>
                        )}
                        {included && splitMethod === 'weights' && <span className="small text-secondary">{m.weight}</span>}
                      </td>
                      <td className="text-end small" style={{ width: '8rem' }}>
                        {preview.allocations?.[m.id] ? <Money cents={preview.allocations[m.id]} noConvert /> : '–'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            {preview.error && amountCents ? <div className="text-danger small mb-2">{preview.error}</div> : null}
            {splitMethod === 'occupancy' && (
              <p className="small text-secondary">
                Uses each member's move-in/move-out dates and weight from <Link to="/household">Household</Link>.
              </p>
            )}

            <Form.Group controlId="notes">
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Form.Group>
            {error && (
              <Alert variant="danger" className="mt-3">
                {error}
              </Alert>
            )}
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save bill'}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={async () => {
                  await discardReceipts(household.id, receiptIds.filter((r) => !original.includes(r)))
                  navigate(-1)
                }}
              >
                Cancel
              </Button>
              {bill && (
                <ConfirmButton
                  className="ms-auto"
                  onConfirm={async () => {
                    await deleteBill(household.id, bill)
                    navigate('/utilities', { replace: true })
                  }}
                >
                  Delete
                </ConfirmButton>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>
    </>
  )
}

function BillExpenseShares({ expenseId }: { expenseId: string }) {
  const { me, memberName } = useActiveHousehold()
  const { item } = useHouseholdDoc<{ id: string; allocations: Record<string, number> }>('expenses', expenseId)
  if (!item) return null
  return (
    <Table size="sm">
      <tbody>
        {Object.entries(item.allocations).map(([id, cents]) => (
          <tr key={id} className={id === me?.id ? 'fw-semibold' : undefined}>
            <td>{memberName(id)}</td>
            <td className="text-end">
              <Money cents={cents} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
