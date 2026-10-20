import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, ButtonGroup, Card, ListGroup } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { addDays, addMonths, formatDate, formatTime, todayISO, weekdayMon0 } from '../lib/dates'
import { EVENT_ICONS, kindClass, titleCase } from '../lib/labels'
import { allOccurrencesBetween, type Occurrence } from '../lib/recurrence'
import type { Contractor, HouseEvent } from '../types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Calendar() {
  const navigate = useNavigate()
  const { isLandlord } = useActiveHousehold()
  const events = useHouseholdCollection<HouseEvent>('events')
  const contractors = useHouseholdCollection<Contractor>('contractors')
  const today = todayISO()
  const [monthStart, setMonthStart] = useState(today.slice(0, 8) + '01')
  const [selected, setSelected] = useState(today)

  const gridStart = addDays(monthStart, -weekdayMon0(monthStart))
  const monthEnd = addDays(addMonths(monthStart, 1), -1)
  const gridEnd = addDays(monthEnd, 6 - weekdayMon0(monthEnd))
  const days = useMemo(() => {
    const result: string[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) result.push(d)
    return result
  }, [gridStart, gridEnd])

  const occurrences = useMemo(
    () => allOccurrencesBetween(events.items, gridStart, gridEnd),
    [events.items, gridStart, gridEnd],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      const day = o.start.slice(0, 10)
      map.set(day, [...(map.get(day) ?? []), o])
    }
    return map
  }, [occurrences])

  const agenda = useMemo(
    () =>
      allOccurrencesBetween(events.items, selected, addDays(selected, 30)).filter((o) => o.event.status !== 'cancelled'),
    [events.items, selected],
  )
  const contractorName = (id?: string) => contractors.items.find((c) => c.id === id)?.name

  const monthLabel = new Date(`${monthStart}T00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader
        title="Calendar"
        icon="calendar-week"
        actions={
          isLandlord && (
            <Button onClick={() => navigate(`/calendar/new?date=${selected}`)}>
              <i className="bi bi-plus-lg me-1" />
              Schedule
            </Button>
          )
        }
      />
      {events.error && <Alert variant="danger">{events.error}</Alert>}
      {!isLandlord && (
        <Alert variant="light" className="small py-2">
          <i className="bi bi-info-circle me-1" />
          Only landlords can change the schedule.
        </Alert>
      )}
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <ButtonGroup size="sm">
              <Button variant="outline-secondary" onClick={() => setMonthStart(addMonths(monthStart, -1, 1))} aria-label="Previous month">
                <i className="bi bi-chevron-left" />
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => {
                  setMonthStart(today.slice(0, 8) + '01')
                  setSelected(today)
                }}
              >
                Today
              </Button>
              <Button variant="outline-secondary" onClick={() => setMonthStart(addMonths(monthStart, 1, 1))} aria-label="Next month">
                <i className="bi bi-chevron-right" />
              </Button>
            </ButtonGroup>
            <strong>{monthLabel}</strong>
          </div>
          {events.loading ? (
            <Loading />
          ) : (
            <div className="cal-grid">
              {WEEKDAYS.map((d) => (
                <div key={d} className="cal-head">
                  {d}
                </div>
              ))}
              {days.map((day) => (
                <div
                  key={day}
                  className={[
                    'cal-cell',
                    day.slice(0, 7) !== monthStart.slice(0, 7) && 'other-month',
                    day === today && 'today',
                    day === selected && 'selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelected(day)}
                >
                  <span className="cal-day">{Number(day.slice(8))}</span>
                  <div>
                    {(byDay.get(day) ?? []).map((o) => (
                      <span
                        key={`${o.event.id}-${o.start}`}
                        className={`cal-event ${kindClass(o.event.kind)} ${o.event.status}`}
                        title={`${formatTime(o.start)} ${o.event.title}`}
                      >
                        {formatTime(o.start)} {o.event.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header className="bg-white">
          <strong>From {formatDate(selected)}</strong>
          <span className="text-secondary small"> · next 30 days</span>
        </Card.Header>
        <ListGroup variant="flush">
          {agenda.length === 0 && <ListGroup.Item className="text-secondary">Nothing scheduled.</ListGroup.Item>}
          {agenda.map((o) => (
            <ListGroup.Item key={`${o.event.id}-${o.start}`} action as={Link} to={`/calendar/${o.event.id}`}>
              <div className="d-flex justify-content-between gap-2">
                <div>
                  <i className={`bi bi-${EVENT_ICONS[o.event.kind]} me-2`} />
                  <strong>{o.event.title}</strong>
                  {o.event.recurrence !== 'none' && <i className="bi bi-arrow-repeat ms-1 text-secondary" title={o.event.recurrence} />}
                  <div className="small text-secondary">
                    {titleCase(o.event.kind)}
                    {contractorName(o.event.contractorId) && ` · ${contractorName(o.event.contractorId)}`}
                  </div>
                </div>
                <div className="text-end small">
                  {formatDate(o.start)}
                  <div>{formatTime(o.start)}</div>
                  {o.event.status === 'done' && <Badge bg="success">done</Badge>}
                </div>
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card>
    </>
  )
}
