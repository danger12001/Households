import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Col, Form, ListGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { LinkButton } from '../components/LinkButton'
import { ReceiptPicker } from '../components/Receipts'
import { diffDays, formatDate, formatDateTime, nowLocalDateTime } from '../lib/dates'
import { BILL_SPLIT_LABELS, titleCase, UTILITY_ICONS } from '../lib/labels'
import { addItem, deleteItem, discardReceipts } from '../services/db'
import type { Bill, MeterReading } from '../types'

export function Utilities() {
  const { isLandlord, memberName } = useActiveHousehold()
  const bills = useHouseholdCollection<Bill>('bills')
  const sorted = useMemo(() => [...bills.items].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)), [bills.items])

  return (
    <>
      <PageHeader
        title="Utilities"
        icon="lightning-charge"
        actions={
          isLandlord && (
            <LinkButton to="/utilities/new">
              <i className="bi bi-plus-lg me-1" />
              Add bill
            </LinkButton>
          )
        }
      />
      {bills.error && <Alert variant="danger">{bills.error}</Alert>}
      <Row className="g-3">
        <Col lg={7}>
          <Card>
            <Card.Header className="bg-white">
              <strong>Municipal & utility bills</strong>
              <div className="small text-secondary">Each bill is split into an expense, so it shows up in balances.</div>
            </Card.Header>
            {bills.loading ? (
              <Loading />
            ) : (
              <ListGroup variant="flush">
                {sorted.length === 0 && <ListGroup.Item className="text-secondary">No bills yet.</ListGroup.Item>}
                {sorted.map((b) => (
                  <ListGroup.Item
                    key={b.id}
                    action
                    as={Link}
                    to={`/utilities/${b.id}`}
                    className="d-flex justify-content-between gap-2"
                  >
                    <div>
                      <i className={`bi bi-${UTILITY_ICONS[b.utility]} me-2`} />
                      <strong>{titleCase(b.utility)}</strong>
                      {b.receiptIds.length > 0 && <i className="bi bi-paperclip ms-1 text-secondary" />}
                      <div className="small text-secondary">
                        {formatDate(b.periodStart)} – {formatDate(b.periodEnd)} · {BILL_SPLIT_LABELS[b.splitMethod].toLowerCase()} ·
                        paid by {memberName(b.paidBy)}
                      </div>
                    </div>
                    <Money cents={b.amountCents} />
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Card>
        </Col>
        <Col lg={5}>
          <MeterReadings />
        </Col>
      </Row>
    </>
  )
}

function MeterReadings() {
  const { email } = useAuth()
  const { household, isLandlord } = useActiveHousehold()
  const { items, loading, error } = useHouseholdCollection<MeterReading>('meterReadings')
  const [adding, setAdding] = useState(false)

  const meters = useMemo(() => {
    const byMeter = new Map<string, MeterReading[]>()
    for (const r of items) byMeter.set(r.meter, [...(byMeter.get(r.meter) ?? []), r])
    return [...byMeter.entries()]
      .map(([meter, readings]) => [meter, readings.sort((a, b) => b.takenAt.localeCompare(a.takenAt))] as const)
      .sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  return (
    <Card>
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <strong>Meter readings</strong>
        {isLandlord && !adding && (
          <Button size="sm" variant="outline-primary" onClick={() => setAdding(true)}>
            <i className="bi bi-plus-lg" /> Reading
          </Button>
        )}
      </Card.Header>
      {error && <Alert variant="danger" className="m-2">{error}</Alert>}
      {adding && email && (
        <ReadingForm
          meters={meters.map(([m, rs]) => ({ name: m, unit: rs[0].unit }))}
          onDone={() => setAdding(false)}
          householdId={household.id}
          email={email}
        />
      )}
      {loading ? (
        <Loading />
      ) : meters.length === 0 ? (
        <Card.Body className="text-secondary small">
          No readings yet. Record your prepaid or smart meter (and any sub-meters) regularly to see usage between
          readings – handy for the "by sub-meter usage" bill split.
        </Card.Body>
      ) : (
        meters.map(([meter, readings]) => (
          <div key={meter} className="border-top">
            <div className="px-3 pt-2 fw-semibold">{meter}</div>
            <Table size="sm" className="mb-0 small align-middle">
              <thead>
                <tr>
                  <th className="ps-3">Taken</th>
                  <th className="text-end">Reading</th>
                  <th className="text-end">Used</th>
                  <th className="text-end">/ day</th>
                  {isLandlord && <th />}
                </tr>
              </thead>
              <tbody>
                {readings.slice(0, 8).map((r, i) => {
                  const previous = readings[i + 1]
                  const used = previous ? r.reading - previous.reading : null
                  const days = previous ? Math.max(1, diffDays(previous.takenAt, r.takenAt)) : null
                  return (
                    <tr key={r.id}>
                      <td className="ps-3">
                        {formatDateTime(r.takenAt)}
                        {r.source !== 'manual' && <i className="bi bi-broadcast ms-1 text-secondary" title={r.source} />}
                      </td>
                      <td className="text-end">
                        {r.reading.toLocaleString()} {r.unit}
                      </td>
                      <td className="text-end">{used !== null ? used.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '–'}</td>
                      <td className="text-end">
                        {used !== null && days ? (used / days).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '–'}
                      </td>
                      {isLandlord && (
                        <td className="text-end pe-2">
                          <ConfirmButton
                            size="sm"
                            confirmLabel="Delete"
                            onConfirm={async () => {
                              await deleteItem(household.id, 'meterReadings', r.id)
                              await discardReceipts(household.id, r.receiptIds)
                            }}
                          >
                            <i className="bi bi-trash" />
                          </ConfirmButton>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        ))
      )}
    </Card>
  )
}

function ReadingForm({
  meters,
  householdId,
  email,
  onDone,
}: {
  meters: { name: string; unit: string }[]
  householdId: string
  email: string
  onDone: () => void
}) {
  const [meter, setMeter] = useState(meters[0]?.name ?? 'Electricity – main')
  const [unit, setUnit] = useState(meters[0]?.unit ?? 'kWh')
  const [reading, setReading] = useState('')
  const [takenAt, setTakenAt] = useState(nowLocalDateTime())
  const [receiptIds, setReceiptIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(reading.replace(',', '.'))
    if (!Number.isFinite(value)) return setError('Enter the number shown on the meter')
    try {
      await addItem<MeterReading>(householdId, 'meterReadings', {
        meter: meter.trim(),
        unit: unit.trim(),
        reading: value,
        takenAt,
        receiptIds,
        source: 'manual',
        createdBy: email,
        createdAt: Date.now(),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card.Body className="border-bottom">
      <Form onSubmit={submit}>
        <Row className="g-2">
          <Col xs={8}>
            <Form.Control
              required
              list="meter-names"
              placeholder="Meter"
              value={meter}
              onChange={(e) => {
                setMeter(e.target.value)
                const known = meters.find((m) => m.name === e.target.value)
                if (known) setUnit(known.unit)
              }}
            />
            <datalist id="meter-names">
              {meters.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </Col>
          <Col xs={4}>
            <Form.Control required placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} list="units" />
            <datalist id="units">
              <option value="kWh" />
              <option value="kL" />
              <option value="m³" />
            </datalist>
          </Col>
          <Col xs={6}>
            <Form.Control required inputMode="decimal" placeholder="Reading" value={reading} onChange={(e) => setReading(e.target.value)} />
          </Col>
          <Col xs={6}>
            <Form.Control type="datetime-local" required value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
          </Col>
        </Row>
        <div className="mt-2">
          <ReceiptPicker value={receiptIds} onChange={setReceiptIds} label="Photo of the meter (optional)" />
        </div>
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}
        <div className="d-flex gap-2">
          <Button type="submit" size="sm">
            Save reading
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={async () => {
              await discardReceipts(householdId, receiptIds)
              onDone()
            }}
          >
            Cancel
          </Button>
        </div>
      </Form>
    </Card.Body>
  )
}
