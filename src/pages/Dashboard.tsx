import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Card, Col, ListGroup, Row } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { Money } from '../components/Money'
import { LinkButton } from '../components/LinkButton'
import { computeNet, simplifyDebts } from '../lib/balances'
import { addDays, formatDate, formatDateTime, todayISO } from '../lib/dates'
import { CATEGORY_ICONS, EVENT_ICONS } from '../lib/labels'
import { allOccurrencesBetween } from '../lib/recurrence'
import type { Expense, HouseEvent, Settlement } from '../types'

export function Dashboard() {
  const { me, isLandlord, memberName } = useActiveHousehold()
  const expenses = useHouseholdCollection<Expense>('expenses')
  const settlements = useHouseholdCollection<Settlement>('settlements')
  const events = useHouseholdCollection<HouseEvent>('events')

  const net = useMemo(() => computeNet(expenses.items, settlements.items), [expenses.items, settlements.items])
  const myNet = me ? (net[me.id] ?? 0) : 0
  const myTransfers = useMemo(
    () => simplifyDebts(net).filter((t) => me && (t.from === me.id || t.to === me.id)),
    [net, me],
  )
  const today = todayISO()
  const upcoming = useMemo(
    () =>
      allOccurrencesBetween(
        events.items.filter((e) => e.status !== 'cancelled'),
        today,
        addDays(today, 14),
      ).slice(0, 6),
    [events.items, today],
  )
  const recent = useMemo(
    () => [...expenses.items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5),
    [expenses.items],
  )
  const disputed = expenses.items.filter((e) => e.status === 'disputed')

  return (
    <>
      <Row className="g-3 mb-3">
        <Col md={4}>
          <Card className="h-100">
            <Card.Body>
              <div className="text-secondary small">Your balance</div>
              <div className={`stat-value ${myNet < 0 ? 'text-danger' : myNet > 0 ? 'text-success' : ''}`}>
                <Money cents={Math.abs(myNet)} />
              </div>
              <div className="small text-secondary">
                {myNet > 0 ? 'owed to you' : myNet < 0 ? 'you owe' : 'all settled up'}
              </div>
              {myTransfers.map((t) => (
                <div key={`${t.from}-${t.to}`} className="small mt-1">
                  {t.from === me?.id ? `Pay ${memberName(t.to)} ` : `${memberName(t.from)} pays you `}
                  <Money cents={t.amountCents} noConvert />
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
        <Col md={8}>
          <Card className="h-100">
            <Card.Body className="d-flex flex-column justify-content-center">
              <div className="d-grid gap-2 d-sm-flex">
                <LinkButton to="/expenses/new">
                  <i className="bi bi-plus-lg me-1" />
                  Add expense claim
                </LinkButton>
                <LinkButton to="/balances" variant="outline-primary">
                  <i className="bi bi-cash-coin me-1" />
                  Settle up
                </LinkButton>
                {isLandlord && (
                  <>
                    <LinkButton to="/calendar/new" variant="outline-primary">
                      <i className="bi bi-calendar-plus me-1" />
                      Schedule work
                    </LinkButton>
                    <LinkButton to="/utilities/new" variant="outline-primary">
                      <i className="bi bi-lightning-charge me-1" />
                      Add bill
                    </LinkButton>
                  </>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {disputed.length > 0 && (
        <Alert variant="warning">
          <i className="bi bi-exclamation-triangle me-1" />
          {disputed.length} disputed {disputed.length === 1 ? 'claim' : 'claims'} left out of balances until resolved.{' '}
          <Link to="/expenses?status=disputed">Review</Link>
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={6}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center bg-white">
              <strong>Coming up (2 weeks)</strong>
              <Link to="/calendar" className="small">
                Calendar
              </Link>
            </Card.Header>
            <ListGroup variant="flush">
              {upcoming.length === 0 && <ListGroup.Item className="text-secondary">Nothing scheduled.</ListGroup.Item>}
              {upcoming.map((o) => (
                <ListGroup.Item key={`${o.event.id}-${o.start}`} action as={Link} to={`/calendar/${o.event.id}`}>
                  <i className={`bi bi-${EVENT_ICONS[o.event.kind]} me-2`} />
                  <strong>{o.event.title}</strong>
                  <div className="small text-secondary">{formatDateTime(o.start)}</div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
        <Col lg={6}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center bg-white">
              <strong>Recent expenses</strong>
              <Link to="/expenses" className="small">
                All expenses
              </Link>
            </Card.Header>
            <ListGroup variant="flush">
              {recent.length === 0 && <ListGroup.Item className="text-secondary">No expenses yet.</ListGroup.Item>}
              {recent.map((e) => (
                <ListGroup.Item
                  key={e.id}
                  action
                  as={Link}
                  to={`/expenses/${e.id}`}
                  className="d-flex justify-content-between gap-2"
                >
                  <div className="text-truncate">
                    <i className={`bi bi-${CATEGORY_ICONS[e.category]} me-2`} />
                    {e.description}
                    <div className="small text-secondary">
                      {formatDate(e.date)} · paid by {memberName(e.paidBy)}
                      {e.status === 'disputed' && (
                        <Badge bg="warning" text="dark" className="ms-1">
                          disputed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Money cents={e.amountCents} />
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </>
  )
}
