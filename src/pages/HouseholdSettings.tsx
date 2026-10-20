import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Col, Form, InputGroup, ListGroup, Row } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { ConfirmButton } from '../components/ConfirmButton'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../lib/dates'
import { fetchRate, LANDLORD_CURRENCIES, type RateQuote } from '../lib/exchange'
import { newId, saveMembers, updateHouseholdSettings } from '../services/db'
import { relinkTenantLedgers } from '../services/ledgers'
import type { Member, Role } from '../types'

export function HouseholdSettings() {
  const { isLandlord } = useActiveHousehold()
  return (
    <>
      <PageHeader title="Household" icon="people" />
      <Row className="g-3">
        <Col lg={7}>
          <MembersCard />
        </Col>
        <Col lg={5}>
          {isLandlord && <SettingsCard />}
          <CurrencyCard />
        </Col>
      </Row>
    </>
  )
}

function MembersCard() {
  const { email } = useAuth()
  const { household, members, isLandlord } = useActiveHousehold()
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (member: Member) => {
    setError(null)
    try {
      const previous = household.members[member.id]
      const members = { ...household.members, [member.id]: member }
      await saveMembers(household.id, members)
      // Tenant ledgers are scoped by email, so follow the member to their new address.
      if (previous && previous.email !== member.email) {
        await relinkTenantLedgers({ ...household, members }, member.id)
      }
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (member: Member) => {
    const { [member.id]: _removed, ...rest } = household.members
    try {
      await saveMembers(household.id, rest)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card>
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <strong>Members</strong>
        {isLandlord && !editing && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <i className="bi bi-person-plus me-1" />
            Add member
          </Button>
        )}
      </Card.Header>
      {error && <Alert variant="danger" className="m-2">{error}</Alert>}
      {editing && (
        <MemberForm
          key={editing === 'new' ? 'new' : editing.id}
          member={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      <ListGroup variant="flush">
        {members.map((m) => (
          <ListGroup.Item key={m.id} className="d-flex justify-content-between gap-2">
            <div>
              <strong>{m.name}</strong>{' '}
              <Badge bg={m.role === 'landlord' ? 'warning' : 'secondary'} text={m.role === 'landlord' ? 'dark' : undefined}>
                {m.role}
              </Badge>
              {m.room && <span className="text-secondary small"> · {m.room}</span>}
              <div className="small text-secondary">
                {m.email ?? 'no login'}
                {m.phone && ` · ${m.phone}`}
              </div>
              {isLandlord && (
                <div className="small text-secondary">
                  {m.sharesUtilities ? `shares utilities (weight ${m.weight})` : 'excluded from utilities'}
                  {m.moveIn && ` · in ${formatDate(m.moveIn)}`}
                  {m.moveOut && ` · out ${formatDate(m.moveOut)}`}
                </div>
              )}
            </div>
            {isLandlord && (
              <div className="d-flex gap-2 align-items-start">
                <Button size="sm" variant="outline-secondary" onClick={() => setEditing(m)}>
                  Edit
                </Button>
                {m.email !== email && (
                  <ConfirmButton size="sm" confirmLabel="Remove" onConfirm={() => remove(m)}>
                    <i className="bi bi-person-x" />
                  </ConfirmButton>
                )}
              </div>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>
      {isLandlord && (
        <Card.Footer className="small text-secondary bg-white">
          Tenants get access by signing in with the email you enter here. Removing a member keeps their past expenses
          but they lose access.
        </Card.Footer>
      )}
    </Card>
  )
}

function MemberForm({
  member,
  onSave,
  onCancel,
}: {
  member: Member | null
  onSave: (member: Member) => Promise<void>
  onCancel: () => void
}) {
  const { email: myEmail } = useAuth()
  const { members } = useActiveHousehold()
  const [form, setForm] = useState<Member>(
    member ?? { id: newId(), name: '', email: '', role: 'tenant', weight: 1, sharesUtilities: true },
  )
  const [error, setError] = useState<string | null>(null)
  const isSelf = !!member && member.email === myEmail

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const email = form.email?.trim().toLowerCase() || undefined
    if (email && members.some((m) => m.id !== form.id && m.email === email)) {
      return setError('Another member already uses that email')
    }
    await onSave({
      ...form,
      name: form.name.trim(),
      email,
      room: form.room?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      moveIn: form.moveIn || undefined,
      moveOut: form.moveOut || undefined,
    })
  }

  return (
    <Card.Body className="border-bottom">
      <Form onSubmit={submit}>
        <Row className="g-2">
          <Col md={6}>
            <Form.Label className="small">Name</Form.Label>
            <Form.Control required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Col>
          <Col md={6}>
            <Form.Label className="small">Sign-in email</Form.Label>
            <Form.Control
              type="email"
              value={form.email ?? ''}
              disabled={isSelf}
              placeholder="Leave blank if they won't log in"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small">Role</Form.Label>
            <Form.Select
              value={form.role}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              <option value="tenant">Tenant</option>
              <option value="landlord">Landlord</option>
            </Form.Select>
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small">Room</Form.Label>
            <Form.Control value={form.room ?? ''} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </Col>
          <Col md={6}>
            <Form.Label className="small">Phone</Form.Label>
            <Form.Control type="tel" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small">Moved in</Form.Label>
            <Form.Control type="date" value={form.moveIn ?? ''} onChange={(e) => setForm({ ...form, moveIn: e.target.value })} />
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small">Moved out</Form.Label>
            <Form.Control type="date" value={form.moveOut ?? ''} onChange={(e) => setForm({ ...form, moveOut: e.target.value })} />
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small">Utility weight</Form.Label>
            <Form.Control
              type="number"
              min={0}
              step="0.5"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Math.max(0, Number(e.target.value)) })}
            />
          </Col>
          <Col xs={6} md={3} className="d-flex align-items-end">
            <Form.Check
              id="sharesUtilities"
              label="Shares utilities"
              checked={form.sharesUtilities}
              onChange={(e) => setForm({ ...form, sharesUtilities: e.target.checked })}
            />
          </Col>
        </Row>
        {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
        <div className="d-flex gap-2 mt-2">
          <Button type="submit" size="sm">
            Save member
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Form>
    </Card.Body>
  )
}

function SettingsCard() {
  const { household } = useActiveHousehold()
  const [name, setName] = useState(household.name)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await updateHouseholdSettings(household.id, { name: name.trim() })
    setSaved(true)
  }

  return (
    <Card className="mb-3">
      <Card.Header className="bg-white">
        <strong>Household</strong>
      </Card.Header>
      <Card.Body>
        <Form onSubmit={submit} className="d-flex gap-2">
          <Form.Control
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
            aria-label="Household name"
          />
          <Button type="submit" variant="outline-primary" disabled={name.trim() === household.name}>
            {saved ? 'Saved' : 'Rename'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  )
}

function CurrencyCard() {
  const { household, isLandlord } = useActiveHousehold()
  const [live, setLive] = useState<RateQuote | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState(household.rateSource === 'manual' ? String(household.exchangeRate ?? '') : '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLive(null)
    setLiveError(null)
    fetchRate(household.currency, household.landlordCurrency)
      .then((quote) => !cancelled && setLive(quote))
      .catch((err) => !cancelled && setLiveError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [household.currency, household.landlordCurrency])

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const switchToLiveRate = () =>
    run(async () => {
      const quote = live ?? (await fetchRate(household.currency, household.landlordCurrency))
      await updateHouseholdSettings(household.id, {
        exchangeRate: quote.rate,
        rateUpdatedAt: Date.now(),
        rateSource: 'auto',
      })
    })

  const saveEstimate = (event: FormEvent) => {
    event.preventDefault()
    const rate = Number(estimate.replace(',', '.'))
    if (!(rate > 0)) return setError('Enter a positive rate')
    void run(() =>
      updateHouseholdSettings(household.id, { exchangeRate: rate, rateUpdatedAt: Date.now(), rateSource: 'manual' }),
    )
  }

  const inverse = (rate: number) => (1 / rate).toFixed(2)
  const converting = household.landlordCurrency !== household.currency

  return (
    <Card>
      <Card.Header className="bg-white">
        <strong>Currency</strong>
      </Card.Header>
      <Card.Body>
        <p className="small mb-2">
          Amounts are recorded in <strong>rand (ZAR)</strong>.
          {converting ? (
            <>
              {' '}
              Landlords also see them in <strong>{household.landlordCurrency}</strong>.
            </>
          ) : (
            ' The landlord currency is also rand, so nothing is converted.'
          )}
        </p>
        {!converting ? null : household.exchangeRate ? (
          <div className="mb-3">
            <div>
              1 {household.currency} = <strong>{household.exchangeRate}</strong> {household.landlordCurrency}
              <span className="text-secondary small">
                {' '}
                (1 {household.landlordCurrency} ≈ R{inverse(household.exchangeRate)})
              </span>
            </div>
            <div className="small text-secondary">
              {household.rateSource === 'manual' ? 'Landlord estimate' : 'ECB daily rate, refreshed automatically'}
              {household.rateUpdatedAt && ` · set ${new Date(household.rateUpdatedAt).toLocaleString()}`}
            </div>
            <div className="small mt-1">
              e.g. <Money cents={100000} alwaysConvert />
            </div>
          </div>
        ) : (
          <p className="small text-secondary">No exchange rate yet.</p>
        )}

        {isLandlord && (
          <>
            <Form.Group className="mb-3">
              <Form.Label className="small">Your currency</Form.Label>
              <Form.Select
                value={household.landlordCurrency}
                onChange={(e) =>
                  void run(() =>
                    updateHouseholdSettings(household.id, {
                      landlordCurrency: e.target.value,
                      exchangeRate: null,
                      rateSource: 'auto',
                    }),
                  )
                }
              >
                {LANDLORD_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </>
        )}

        {isLandlord && converting && (
          <>
            <div className="small mb-2">
              Live ECB rate:{' '}
              {live ? (
                <>
                  <strong>{live.rate}</strong> ({live.date})
                </>
              ) : (
                <span className="text-secondary">{liveError ?? 'loading…'}</span>
              )}
            </div>
            {household.rateSource === 'manual' && (
              <Button size="sm" variant="outline-primary" className="mb-3" onClick={() => void switchToLiveRate()}>
                Switch to live rate
              </Button>
            )}

            <Form onSubmit={saveEstimate}>
              <Form.Label className="small">Or use your own estimate</Form.Label>
              <InputGroup size="sm">
                <InputGroup.Text>1 ZAR =</InputGroup.Text>
                <Form.Control
                  inputMode="decimal"
                  placeholder={live ? String(live.rate) : '0.05'}
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                />
                <InputGroup.Text>{household.landlordCurrency}</InputGroup.Text>
                <Button type="submit" variant="outline-primary">
                  Use estimate
                </Button>
              </InputGroup>
              <Form.Text>Estimates stay fixed until you change them or switch back to the live rate.</Form.Text>
            </Form>
          </>
        )}
        {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
      </Card.Body>
    </Card>
  )
}
