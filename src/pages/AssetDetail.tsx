import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, ButtonGroup, Card, Col, Form, InputGroup, ListGroup, Row, Table } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection, useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import { assetType, isLowStock, latestReadings, readingStatus, type ReadingDef, type ReadingStatus } from '../lib/assets'
import { addDays, formatDate, formatDateTime, nowLocalDateTime, todayISO } from '../lib/dates'
import { allOccurrencesBetween } from '../lib/recurrence'
import { addItem, deleteItem, discardReceipts, updateItem } from '../services/db'
import { addAssetLog, adjustSupply, deleteAsset, deleteAssetLog } from '../services/assets'
import type { Asset, AssetLog, AssetLogKind, Contractor, Expense, HouseEvent, Supply } from '../types'

const STATUS_VARIANT: Record<ReadingStatus, string> = { low: 'danger', high: 'danger', ok: 'success', none: 'secondary' }

function formatReading(value: number, def?: ReadingDef) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${def?.unit ? ` ${def.unit}` : ''}`
}

export function AssetDetail() {
  const { id } = useParams()
  const { item: asset, loading } = useHouseholdDoc<Asset>('assets', id)
  if (loading) return <Loading />
  if (!asset) {
    return (
      <Alert variant="warning">
        Not found. <Link to="/property">Back to property</Link>
      </Alert>
    )
  }
  return <AssetView asset={asset} />
}

function AssetView({ asset }: { asset: Asset }) {
  const navigate = useNavigate()
  const { household, isLandlord } = useActiveHousehold()
  const def = assetType(asset.type)
  const logs = useHouseholdCollection<AssetLog>('assetLogs', ['assetId', asset.id])
  const supplies = useHouseholdCollection<Supply>('supplies', ['assetId', asset.id])
  const events = useHouseholdCollection<HouseEvent>('events')
  const expenses = useHouseholdCollection<Expense>('expenses')
  const contractors = useHouseholdCollection<Contractor>('contractors')
  const [logging, setLogging] = useState<AssetLogKind | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)

  const sortedLogs = useMemo(() => [...logs.items].sort((a, b) => b.takenAt.localeCompare(a.takenAt)), [logs.items])
  const latest = useMemo(() => latestReadings(logs.items), [logs.items])
  const sortedSupplies = useMemo(() => [...supplies.items].sort((a, b) => a.name.localeCompare(b.name)), [supplies.items])
  const supplyIds = new Set(supplies.items.map((s) => s.id))
  const today = todayISO()
  const upcoming = useMemo(
    () =>
      def.eventKind
        ? allOccurrencesBetween(
            events.items.filter((e) => e.kind === def.eventKind && e.status !== 'cancelled'),
            today,
            addDays(today, 60),
          ).slice(0, 5)
        : [],
    [events.items, def.eventKind, today],
  )
  const related = useMemo(
    () =>
      def.expenseCategory
        ? expenses.items.filter((e) => e.category === def.expenseCategory).sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [expenses.items, def.expenseCategory],
  )
  const yearSpend = related.filter((e) => e.date >= addDays(today, -365)).reduce((sum, e) => sum + e.amountCents, 0)
  const contractor = contractors.items.find((c) => c.id === asset.contractorId)
  const supplyName = (id: string) => supplies.items.find((s) => s.id === id)

  return (
    <>
      <PageHeader
        title={asset.name}
        icon={def.icon}
        actions={
          isLandlord && (
            <>
              <Button onClick={() => setLogging(def.readings.length ? 'test' : 'maintenance')}>
                <i className="bi bi-plus-lg me-1" />
                Log
              </Button>
              {!editingDetails && (
                <Button variant="outline-secondary" onClick={() => setEditingDetails(true)}>
                  Edit
                </Button>
              )}
            </>
          )
        }
      />
      {(logs.error || supplies.error) && <Alert variant="danger">{logs.error ?? supplies.error}</Alert>}
      {editingDetails && <DetailsForm asset={asset} contractors={contractors.items} onDone={() => setEditingDetails(false)} />}
      {logging && (
        <LogForm asset={asset} supplies={sortedSupplies} initialKind={logging} onDone={() => setLogging(null)} />
      )}

      <Row className="g-3 mb-3">
        {def.readings.length > 0 && (
          <Col lg={6}>
            <Card className="h-100">
              <Card.Header className="bg-white">
                <strong>Latest readings</strong>
              </Card.Header>
              <Table size="sm" className="mb-0 align-middle small">
                <tbody>
                  {def.readings.map((r) => {
                    const reading = latest[r.key]
                    const status = readingStatus(reading?.value, r)
                    return (
                      <tr key={r.key}>
                        <td className="ps-3">{r.label}</td>
                        <td className="text-end">{reading ? formatReading(reading.value, r) : '–'}</td>
                        <td className="text-secondary text-nowrap">
                          {r.min !== undefined || r.max !== undefined ? `target ${r.min ?? ''}–${r.max ?? ''}` : ''}
                        </td>
                        <td className="pe-3 text-end">
                          {status !== 'none' && <Badge bg={STATUS_VARIANT[status]}>{status}</Badge>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card>
          </Col>
        )}
        <Col lg={def.readings.length > 0 ? 6 : 12}>
          <Card className="h-100">
            <Card.Header className="bg-white">
              <strong>Details</strong>
            </Card.Header>
            <Card.Body className="small">
              {def.details.filter((d) => asset.details[d.key]).length === 0 && !contractor && !asset.notes && (
                <span className="text-secondary">No details yet.</span>
              )}
              <dl className="row mb-0">
                {def.details
                  .filter((d) => asset.details[d.key])
                  .map((d) => (
                    <Fragment key={d.key}>
                      <dt className="col-5">{d.label}</dt>
                      <dd className="col-7">{asset.details[d.key]}</dd>
                    </Fragment>
                  ))}
                {contractor && (
                  <>
                    <dt className="col-5">Serviced by</dt>
                    <dd className="col-7">
                      {contractor.name}
                      {contractor.phone && (
                        <>
                          {' · '}
                          <a href={`tel:${contractor.phone}`}>{contractor.phone}</a>
                        </>
                      )}
                    </dd>
                  </>
                )}
              </dl>
              {asset.notes && <p className="mb-0 mt-2" style={{ whiteSpace: 'pre-wrap' }}>{asset.notes}</p>}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={6}>
          <SuppliesCard asset={asset} supplies={sortedSupplies} />
        </Col>
        <Col lg={6}>
          <Card className="mb-3">
            <Card.Header className="bg-white d-flex justify-content-between">
              <strong>Coming up</strong>
              <Link to="/calendar" className="small">
                Calendar
              </Link>
            </Card.Header>
            <ListGroup variant="flush">
              {upcoming.length === 0 && (
                <ListGroup.Item className="text-secondary small">
                  Nothing scheduled{def.eventKind ? ` (calendar events of type “${def.eventKind}”)` : ''}.
                </ListGroup.Item>
              )}
              {upcoming.map((o) => (
                <ListGroup.Item key={`${o.event.id}-${o.start}`} action as={Link} to={`/calendar/${o.event.id}`} className="small">
                  <strong>{o.event.title}</strong> · {formatDateTime(o.start)}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
          {def.expenseCategory && (
            <Card>
              <Card.Header className="bg-white d-flex justify-content-between">
                <strong>Spending</strong>
                <Link to={`/expenses?category=${def.expenseCategory}`} className="small">
                  All {def.expenseCategory} expenses
                </Link>
              </Card.Header>
              <Card.Body className="small">
                Last 12 months: <Money cents={yearSpend} />
                {related.slice(0, 3).map((e) => (
                  <div key={e.id} className="d-flex justify-content-between">
                    <Link to={`/expenses/${e.id}`}>{e.description}</Link>
                    <span>
                      {formatDate(e.date)} · <Money cents={e.amountCents} noConvert />
                    </span>
                  </div>
                ))}
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      <Card className="mb-3">
        <Card.Header className="bg-white">
          <strong>Log</strong>
        </Card.Header>
        <ListGroup variant="flush">
          {sortedLogs.length === 0 && <ListGroup.Item className="text-secondary small">Nothing logged yet.</ListGroup.Item>}
          {sortedLogs.map((log) => (
            <ListGroup.Item key={log.id}>
              <div className="d-flex justify-content-between gap-2">
                <div className="small">
                  <Badge bg={log.kind === 'issue' ? 'danger' : log.kind === 'test' ? 'info' : 'secondary'} className="me-2">
                    {log.kind}
                  </Badge>
                  <strong>{formatDateTime(log.takenAt)}</strong>
                  <div className="d-flex flex-wrap gap-2 mt-1">
                    {Object.entries(log.readings).map(([key, value]) => {
                      const r = def.readings.find((d) => d.key === key)
                      const status = r ? readingStatus(value, r) : 'none'
                      return (
                        <span key={key} className={status === 'low' || status === 'high' ? 'text-danger' : ''}>
                          {r?.label ?? key}: {formatReading(value, r)}
                        </span>
                      )
                    })}
                  </div>
                  {log.supplyUsage.length > 0 && (
                    <div className="text-secondary">
                      Used:{' '}
                      {log.supplyUsage
                        .map((u) => {
                          const s = supplyName(u.supplyId)
                          return `${u.quantity} ${s?.unit ?? ''} ${s?.name ?? '(removed supply)'}`
                        })
                        .join(', ')}
                    </div>
                  )}
                  {log.note && <div style={{ whiteSpace: 'pre-wrap' }}>{log.note}</div>}
                  <ReceiptPicker value={log.receiptIds} readOnly label="" />
                </div>
                {isLandlord && (
                  <ConfirmButton size="sm" confirmLabel="Delete" onConfirm={() => deleteAssetLog(household.id, log, supplyIds)}>
                    <i className="bi bi-trash" />
                  </ConfirmButton>
                )}
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card>

      {isLandlord && (
        <div className="text-end">
          <ConfirmButton
            confirmLabel={`Delete ${asset.name}, its log and stock`}
            onConfirm={async () => {
              await deleteAsset(household.id, asset.id)
              navigate('/property', { replace: true })
            }}
          >
            Delete
          </ConfirmButton>
        </div>
      )}
    </>
  )
}

function SuppliesCard({ asset, supplies }: { asset: Asset; supplies: Supply[] }) {
  const { household, isLandlord } = useActiveHousehold()
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [adding, setAdding] = useState(false)
  const [newSupply, setNewSupply] = useState({ name: '', unit: 'kg', quantity: '', reorderAt: '' })
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const applyAdjust = (supply: Supply, sign: 1 | -1) => {
    const value = Number(amount.replace(',', '.'))
    if (!(value > 0)) return setError('Enter a quantity')
    void run(async () => {
      await adjustSupply(household.id, supply.id, sign * value)
      setAdjusting(null)
      setAmount('')
    })
  }

  const addSupply = (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(newSupply.quantity.replace(',', '.')) || 0
    const reorderAt = newSupply.reorderAt.trim() ? Number(newSupply.reorderAt.replace(',', '.')) : undefined
    void run(async () => {
      await addItem<Supply>(household.id, 'supplies', {
        assetId: asset.id,
        name: newSupply.name.trim(),
        unit: newSupply.unit.trim(),
        quantity,
        reorderAt: Number.isFinite(reorderAt) ? reorderAt : undefined,
        updatedAt: Date.now(),
      })
      setAdding(false)
      setNewSupply({ name: '', unit: 'kg', quantity: '', reorderAt: '' })
    })
  }

  return (
    <Card className="h-100">
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <strong>Supplies</strong>
        {isLandlord && !adding && (
          <Button size="sm" variant="outline-primary" onClick={() => setAdding(true)}>
            <i className="bi bi-plus-lg" /> Item
          </Button>
        )}
      </Card.Header>
      {error && <Alert variant="danger" className="m-2 py-2 small">{error}</Alert>}
      {adding && (
        <Card.Body className="border-bottom">
          <Form onSubmit={addSupply}>
            <Row className="g-2">
              <Col xs={12} md={5}>
                <Form.Control
                  size="sm"
                  required
                  placeholder="Item (e.g. Chlorine tablets)"
                  value={newSupply.name}
                  onChange={(e) => setNewSupply({ ...newSupply, name: e.target.value })}
                />
              </Col>
              <Col xs={4} md={2}>
                <Form.Control
                  size="sm"
                  required
                  placeholder="Unit"
                  value={newSupply.unit}
                  onChange={(e) => setNewSupply({ ...newSupply, unit: e.target.value })}
                />
              </Col>
              <Col xs={4} md={2}>
                <Form.Control
                  size="sm"
                  inputMode="decimal"
                  placeholder="In stock"
                  value={newSupply.quantity}
                  onChange={(e) => setNewSupply({ ...newSupply, quantity: e.target.value })}
                />
              </Col>
              <Col xs={4} md={3}>
                <Form.Control
                  size="sm"
                  inputMode="decimal"
                  placeholder="Reorder at"
                  value={newSupply.reorderAt}
                  onChange={(e) => setNewSupply({ ...newSupply, reorderAt: e.target.value })}
                />
              </Col>
            </Row>
            <div className="d-flex gap-2 mt-2">
              <Button size="sm" type="submit">
                Add item
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </Form>
        </Card.Body>
      )}
      <ListGroup variant="flush">
        {supplies.length === 0 && <ListGroup.Item className="text-secondary small">No supplies tracked.</ListGroup.Item>}
        {supplies.map((s) => (
          <ListGroup.Item key={s.id} className="small">
            <div className="d-flex justify-content-between align-items-center gap-2">
              <div>
                {s.name}
                {isLowStock(s) && (
                  <Badge bg="warning" text="dark" className="ms-1">
                    low
                  </Badge>
                )}
                {s.reorderAt !== undefined && (
                  <div className="text-secondary">
                    reorder at {s.reorderAt} {s.unit}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                <strong className="text-nowrap">
                  {s.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {s.unit}
                </strong>
                {isLandlord && adjusting !== s.id && (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => {
                      setAdjusting(s.id)
                      setAmount('')
                    }}
                  >
                    ±
                  </Button>
                )}
              </div>
            </div>
            {adjusting === s.id && (
              <InputGroup size="sm" className="mt-2">
                <Form.Control
                  autoFocus
                  inputMode="decimal"
                  placeholder={`Quantity (${s.unit})`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button variant="success" onClick={() => applyAdjust(s, 1)}>
                  Restock
                </Button>
                <Button variant="outline-danger" onClick={() => applyAdjust(s, -1)}>
                  Used
                </Button>
                <Button variant="outline-secondary" onClick={() => setAdjusting(null)}>
                  <i className="bi bi-x" />
                </Button>
                <ConfirmButton size="sm" confirmLabel="Remove" onConfirm={() => run(() => deleteItem(household.id, 'supplies', s.id))}>
                  <i className="bi bi-trash" />
                </ConfirmButton>
              </InputGroup>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>
    </Card>
  )
}

function LogForm({
  asset,
  supplies,
  initialKind,
  onDone,
}: {
  asset: Asset
  supplies: Supply[]
  initialKind: AssetLogKind
  onDone: () => void
}) {
  const { email } = useAuth()
  const { household } = useActiveHousehold()
  const def = assetType(asset.type)
  const [kind, setKind] = useState<AssetLogKind>(initialKind)
  const [takenAt, setTakenAt] = useState(nowLocalDateTime())
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [usage, setUsage] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [receiptIds, setReceiptIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(',', '.')) : NaN)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    const parsedReadings = Object.fromEntries(
      Object.entries(readings)
        .map(([key, value]) => [key, num(value)] as const)
        .filter(([, value]) => Number.isFinite(value)),
    )
    const supplyUsage = Object.entries(usage)
      .map(([supplyId, value]) => ({ supplyId, quantity: num(value) }))
      .filter((u) => u.quantity > 0)
    if (!Object.keys(parsedReadings).length && !supplyUsage.length && !note.trim() && !receiptIds.length) {
      return setError('Add a reading, supplies used, a note or a photo')
    }
    setSaving(true)
    setError(null)
    try {
      await addAssetLog(household.id, {
        assetId: asset.id,
        takenAt,
        kind,
        readings: parsedReadings,
        note: note.trim() || undefined,
        supplyUsage,
        receiptIds,
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
          <div className="d-flex flex-wrap gap-2 mb-2">
            <ButtonGroup size="sm">
              {(def.readings.length ? (['test', 'maintenance', 'issue'] as const) : (['maintenance', 'issue'] as const)).map((k) => (
                <Button key={k} variant={kind === k ? 'primary' : 'outline-primary'} onClick={() => setKind(k)}>
                  {k === 'test' ? 'Test / readings' : k === 'maintenance' ? 'Maintenance' : 'Issue'}
                </Button>
              ))}
            </ButtonGroup>
            <Form.Control
              size="sm"
              type="datetime-local"
              style={{ width: 'auto' }}
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
            />
          </div>
          {kind === 'test' && def.readings.length > 0 && (
            <Row className="g-2 mb-2">
              {def.readings.map((r) => {
                const status = readingStatus(num(readings[r.key]), r)
                return (
                  <Col xs={6} md={4} key={r.key}>
                    <Form.Label className="small mb-0">
                      {r.label}
                      {(r.min !== undefined || r.max !== undefined) && (
                        <span className="text-secondary"> ({r.min ?? ''}–{r.max ?? ''})</span>
                      )}
                    </Form.Label>
                    <InputGroup size="sm">
                      <Form.Control
                        inputMode="decimal"
                        value={readings[r.key] ?? ''}
                        isInvalid={status === 'low' || status === 'high'}
                        isValid={status === 'ok'}
                        onChange={(e) => setReadings({ ...readings, [r.key]: e.target.value })}
                      />
                      {r.unit && <InputGroup.Text>{r.unit}</InputGroup.Text>}
                    </InputGroup>
                  </Col>
                )
              })}
            </Row>
          )}
          {supplies.length > 0 && (
            <>
              <div className="small fw-semibold mt-2">Supplies used</div>
              <Row className="g-2 mb-2">
                {supplies.map((s) => (
                  <Col xs={6} md={4} key={s.id}>
                    <InputGroup size="sm">
                      <InputGroup.Text className="text-truncate" style={{ maxWidth: '60%' }} title={s.name}>
                        {s.name}
                      </InputGroup.Text>
                      <Form.Control
                        inputMode="decimal"
                        placeholder="0"
                        value={usage[s.id] ?? ''}
                        onChange={(e) => setUsage({ ...usage, [s.id]: e.target.value })}
                      />
                      <InputGroup.Text>{s.unit}</InputGroup.Text>
                    </InputGroup>
                  </Col>
                ))}
              </Row>
            </>
          )}
          <Form.Control
            as="textarea"
            rows={2}
            className="mb-2"
            placeholder={kind === 'issue' ? "What's wrong? (green water, pump noise…)" : 'Notes (backwashed, cleaned baskets…)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <ReceiptPicker value={receiptIds} onChange={setReceiptIds} label="Photos (optional)" />
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          <div className="d-flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save log'}
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

function DetailsForm({ asset, contractors, onDone }: { asset: Asset; contractors: Contractor[]; onDone: () => void }) {
  const { household } = useActiveHousehold()
  const def = assetType(asset.type)
  const [name, setName] = useState(asset.name)
  const [details, setDetails] = useState<Record<string, string>>(asset.details)
  const [contractorId, setContractorId] = useState(asset.contractorId ?? '')
  const [notes, setNotes] = useState(asset.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await updateItem(household.id, 'assets', asset.id, {
        name: name.trim(),
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v.trim())),
        contractorId: contractorId || null,
        notes: notes.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        <Form onSubmit={submit}>
          <Row className="g-2">
            <Col md={6}>
              <Form.Label className="small">Name</Form.Label>
              <Form.Control required value={name} onChange={(e) => setName(e.target.value)} />
            </Col>
            <Col md={6}>
              <Form.Label className="small">Serviced by</Form.Label>
              <Form.Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                <option value="">Nobody / we do it</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} – {c.trade}
                  </option>
                ))}
              </Form.Select>
            </Col>
            {def.details.map((d) => (
              <Col md={6} key={d.key}>
                <Form.Label className="small">{d.label}</Form.Label>
                <Form.Control
                  placeholder={d.placeholder}
                  value={details[d.key] ?? ''}
                  onChange={(e) => setDetails({ ...details, [d.key]: e.target.value })}
                />
              </Col>
            ))}
            <Col xs={12}>
              <Form.Label className="small">Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Col>
          </Row>
          {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
          <div className="d-flex gap-2 mt-2">
            <Button type="submit">Save</Button>
            <Button variant="outline-secondary" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}
