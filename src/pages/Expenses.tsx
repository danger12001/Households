import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Card, Col, Form, ListGroup, Row } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { LinkButton } from '../components/LinkButton'
import { formatDate } from '../lib/dates'
import { CATEGORY_ICONS, titleCase } from '../lib/labels'
import { EXPENSE_CATEGORIES, type Expense } from '../types'

export function Expenses() {
  const { members, memberName, me } = useActiveHousehold()
  const { items, loading, error } = useHouseholdCollection<Expense>('expenses')
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const member = params.get('member') ?? ''
  const month = params.get('month') ?? ''
  const status = params.get('status') ?? ''

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(
    () =>
      items
        .filter((e) => !category || e.category === category)
        .filter((e) => !member || e.paidBy === member || member in e.allocations)
        .filter((e) => !month || e.date.startsWith(month))
        .filter((e) => !status || e.status === status)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [items, category, member, month, status],
  )
  const total = filtered.reduce((sum, e) => sum + e.amountCents, 0)
  const myShare = me ? filtered.reduce((sum, e) => sum + (e.allocations[me.id] ?? 0), 0) : 0

  return (
    <>
      <PageHeader
        title="Expenses"
        icon="receipt"
        actions={
          <LinkButton to="/expenses/new">
            <i className="bi bi-plus-lg me-1" />
            Add claim
          </LinkButton>
        }
      />
      <Card className="mb-3">
        <Card.Body>
          <Row className="g-2">
            <Col xs={6} md={3}>
              <Form.Select size="sm" value={category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {titleCase(c)}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={3}>
              <Form.Select size="sm" value={member} onChange={(e) => setFilter('member', e.target.value)}>
                <option value="">Everyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={3}>
              <Form.Control
                size="sm"
                type="month"
                value={month}
                onChange={(e) => setFilter('month', e.target.value)}
                aria-label="Month"
              />
            </Col>
            <Col xs={6} md={3}>
              <Form.Select size="sm" value={status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">Any status</option>
                <option value="open">Open</option>
                <option value="disputed">Disputed</option>
              </Form.Select>
            </Col>
          </Row>
          <div className="d-flex flex-wrap gap-3 mt-2 small">
            <span>
              {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'} · total <Money cents={total} />
            </span>
            {me && (
              <span>
                your share <Money cents={myShare} />
              </span>
            )}
          </div>
        </Card.Body>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? (
        <Loading />
      ) : (
        <Card>
          <ListGroup variant="flush">
            {filtered.length === 0 && <ListGroup.Item className="text-secondary">No expenses match.</ListGroup.Item>}
            {filtered.map((e) => (
              <ListGroup.Item
                key={e.id}
                action
                as={Link}
                to={`/expenses/${e.id}`}
                className="d-flex justify-content-between align-items-start gap-2"
              >
                <div className="text-truncate">
                  <i className={`bi bi-${CATEGORY_ICONS[e.category]} me-2`} />
                  <strong>{e.description}</strong>
                  {e.receiptIds.length > 0 && <i className="bi bi-paperclip ms-1 text-secondary" />}
                  <div className="small text-secondary">
                    {formatDate(e.date)} · {titleCase(e.category)} · paid by {memberName(e.paidBy)}
                    {e.billId && (
                      <Badge bg="info" className="ms-1">
                        bill
                      </Badge>
                    )}
                    {e.status === 'disputed' && (
                      <Badge bg="warning" text="dark" className="ms-1">
                        disputed
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-end">
                  <Money cents={e.amountCents} />
                  {me && e.allocations[me.id] !== undefined && (
                    <div className="small text-secondary">
                      you: <Money cents={e.allocations[me.id]} noConvert />
                    </div>
                  )}
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Card>
      )}
    </>
  )
}
