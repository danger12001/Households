import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Form, Row } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection, useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { formatDate, formatDateTime, todayISO } from '../lib/dates'
import { EVENT_ICONS, titleCase } from '../lib/labels'
import { addItem, deleteItem, updateItem } from '../services/db'
import { EVENT_KINDS, type Contractor, type EventKind, type HouseEvent, type Recurrence } from '../types'

export function EventForm() {
  const { id } = useParams()
  const { item, loading } = useHouseholdDoc<HouseEvent>('events', id)
  if (loading) return <Loading />
  if (id && !item) {
    return (
      <Alert variant="warning">
        That event no longer exists. <Link to="/calendar">Back to calendar</Link>
      </Alert>
    )
  }
  return <EventEditor key={id ?? 'new'} event={item} />
}

function EventEditor({ event }: { event: HouseEvent | null }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { email } = useAuth()
  const { household, isLandlord } = useActiveHousehold()
  const contractors = useHouseholdCollection<Contractor>('contractors')

  const [title, setTitle] = useState(event?.title ?? '')
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'general')
  const [contractorId, setContractorId] = useState(event?.contractorId ?? '')
  const [start, setStart] = useState(event?.start ?? `${params.get('date') ?? todayISO()}T09:00`)
  const [durationMinutes, setDuration] = useState(event?.durationMinutes ?? 60)
  const [recurrence, setRecurrence] = useState<Recurrence>(event?.recurrence ?? 'none')
  const [recurUntil, setRecurUntil] = useState(event?.recurUntil ?? '')
  const [status, setStatus] = useState<HouseEvent['status']>(event?.status ?? 'scheduled')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contractor = contractors.items.find((c) => c.id === (event?.contractorId ?? contractorId))

  if (!isLandlord && event) {
    return (
      <>
        <PageHeader
          title={event.title}
          icon={EVENT_ICONS[event.kind]}
          actions={
            <Button variant="outline-secondary" onClick={() => navigate(-1)}>
              Back
            </Button>
          }
        />
        <Card>
          <Card.Body>
            <dl className="row mb-0">
              <dt className="col-sm-3">When</dt>
              <dd className="col-sm-9">
                {formatDateTime(event.start)} ({event.durationMinutes} min)
                {event.recurrence !== 'none' && (
                  <div className="small text-secondary">
                    Repeats {event.recurrence}
                    {event.recurUntil && ` until ${formatDate(event.recurUntil)}`}
                  </div>
                )}
              </dd>
              <dt className="col-sm-3">Type</dt>
              <dd className="col-sm-9">{titleCase(event.kind)}</dd>
              <dt className="col-sm-3">Status</dt>
              <dd className="col-sm-9">{titleCase(event.status)}</dd>
              {contractor && (
                <>
                  <dt className="col-sm-3">Contractor</dt>
                  <dd className="col-sm-9">
                    {contractor.name} {contractor.company && `(${contractor.company})`}
                    {contractor.phone && (
                      <div>
                        <a href={`tel:${contractor.phone}`}>{contractor.phone}</a>
                      </div>
                    )}
                  </dd>
                </>
              )}
              {event.notes && (
                <>
                  <dt className="col-sm-3">Notes</dt>
                  <dd className="col-sm-9" style={{ whiteSpace: 'pre-wrap' }}>
                    {event.notes}
                  </dd>
                </>
              )}
            </dl>
          </Card.Body>
        </Card>
      </>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    if (recurrence !== 'none' && recurUntil && recurUntil < start.slice(0, 10)) {
      return setError('"Repeat until" is before the first date')
    }
    setSaving(true)
    setError(null)
    const data = {
      title: title.trim(),
      kind,
      contractorId: contractorId || null,
      start,
      durationMinutes,
      recurrence,
      recurUntil: recurrence !== 'none' && recurUntil ? recurUntil : null,
      status,
      notes: notes.trim() || null,
    }
    try {
      if (event) {
        await updateItem(household.id, 'events', event.id, data)
      } else {
        await addItem(household.id, 'events', { ...data, createdBy: email, createdAt: Date.now() })
      }
      navigate('/calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title={event ? 'Edit event' : 'Schedule work'} icon="calendar-plus" />
      <Card>
        <Card.Body>
          <Form onSubmit={submit}>
            <Row className="g-3">
              <Col md={8}>
                <Form.Group controlId="title">
                  <Form.Label>Title</Form.Label>
                  <Form.Control
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Geyser replacement, weekly pool service"
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="kind">
                  <Form.Label>Type</Form.Label>
                  <Form.Select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
                    {EVENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {titleCase(k)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="contractor">
                  <Form.Label>Contractor</Form.Label>
                  <Form.Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                    <option value="">None</option>
                    {contractors.items
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} – {c.trade}
                        </option>
                      ))}
                  </Form.Select>
                  <Form.Text>
                    <Link to="/contractors">Manage contractors</Link>
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col xs={7} md={4}>
                <Form.Group controlId="start">
                  <Form.Label>Starts</Form.Label>
                  <Form.Control type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
                </Form.Group>
              </Col>
              <Col xs={5} md={2}>
                <Form.Group controlId="duration">
                  <Form.Label>Minutes</Form.Label>
                  <Form.Control
                    type="number"
                    min={15}
                    step={15}
                    value={durationMinutes}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </Form.Group>
              </Col>
              <Col xs={6} md={4}>
                <Form.Group controlId="recurrence">
                  <Form.Label>Repeats</Form.Label>
                  <Form.Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                    <option value="none">Doesn't repeat</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Every 2 weeks</option>
                    <option value="monthly">Monthly</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {recurrence !== 'none' && (
                <Col xs={6} md={4}>
                  <Form.Group controlId="recurUntil">
                    <Form.Label>Repeat until</Form.Label>
                    <Form.Control type="date" value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} />
                  </Form.Group>
                </Col>
              )}
              <Col xs={6} md={4}>
                <Form.Group controlId="status">
                  <Form.Label>Status</Form.Label>
                  <Form.Select value={status} onChange={(e) => setStatus(e.target.value as HouseEvent['status'])}>
                    <option value="scheduled">Scheduled</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group controlId="notes">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Access instructions, quotes, keep the dogs inside…"
                  />
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
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outline-secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              {event && (
                <ConfirmButton
                  className="ms-auto"
                  onConfirm={async () => {
                    await deleteItem(household.id, 'events', event.id)
                    navigate('/calendar', { replace: true })
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
