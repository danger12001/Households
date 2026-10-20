import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, Col, Form, ListGroup, Row } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { addItem, deleteItem, updateItem } from '../services/db'
import type { Contractor } from '../types'

const EMPTY: Omit<Contractor, 'id' | 'createdAt'> = { name: '', trade: '', company: '', phone: '', email: '', notes: '' }

export function Contractors() {
  const { household, isLandlord } = useActiveHousehold()
  const { items, loading, error } = useHouseholdCollection<Contractor>('contractors')
  const [editing, setEditing] = useState<Contractor | 'new' | null>(null)
  const sorted = [...items].sort((a, b) => a.trade.localeCompare(b.trade) || a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader
        title="Contractors"
        icon="tools"
        actions={
          isLandlord && (
            <Button onClick={() => setEditing('new')}>
              <i className="bi bi-plus-lg me-1" />
              Add contractor
            </Button>
          )
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      {editing && (
        <ContractorForm
          key={editing === 'new' ? 'new' : editing.id}
          contractor={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {loading ? (
        <Loading />
      ) : (
        <Card>
          <ListGroup variant="flush">
            {sorted.length === 0 && (
              <ListGroup.Item className="text-secondary">
                No contractors yet{isLandlord ? ' – add your plumber, electrician, pool guy…' : '.'}
              </ListGroup.Item>
            )}
            {sorted.map((c) => (
              <ListGroup.Item key={c.id} className="d-flex flex-wrap justify-content-between gap-2">
                <div>
                  <strong>{c.name}</strong> <span className="text-secondary">· {c.trade}</span>
                  {c.company && <div className="small">{c.company}</div>}
                  <div className="small d-flex flex-wrap gap-3">
                    {c.phone && (
                      <a href={`tel:${c.phone}`}>
                        <i className="bi bi-telephone me-1" />
                        {c.phone}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/[^\d]/g, '').replace(/^0/, '27')}`} target="_blank" rel="noreferrer">
                        <i className="bi bi-whatsapp me-1" />
                        WhatsApp
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`}>
                        <i className="bi bi-envelope me-1" />
                        {c.email}
                      </a>
                    )}
                  </div>
                  {c.notes && <div className="small text-secondary mt-1">{c.notes}</div>}
                </div>
                {isLandlord && (
                  <div className="d-flex gap-2 align-items-start">
                    <Button size="sm" variant="outline-secondary" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    <ConfirmButton size="sm" onConfirm={() => deleteItem(household.id, 'contractors', c.id)}>
                      <i className="bi bi-trash" />
                    </ConfirmButton>
                  </div>
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Card>
      )}
    </>
  )
}

function ContractorForm({ contractor, onDone }: { contractor: Contractor | null; onDone: () => void }) {
  const { household } = useActiveHousehold()
  const [form, setForm] = useState({ ...EMPTY, ...contractor })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const data = {
      name: form.name.trim(),
      trade: form.trade.trim(),
      company: form.company?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      notes: form.notes?.trim() || null,
    }
    try {
      if (contractor) await updateItem(household.id, 'contractors', contractor.id, data)
      else await addItem(household.id, 'contractors', { ...data, createdAt: Date.now() })
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
          <Row className="g-2">
            <Col md={4}>
              <Form.Control required placeholder="Name" value={form.name} onChange={set('name')} />
            </Col>
            <Col md={4}>
              <Form.Control required placeholder="Trade (plumber, electrician…)" value={form.trade} onChange={set('trade')} list="trades" />
              <datalist id="trades">
                {['Plumber', 'Electrician', 'Pool service', 'Gardener', 'Vet', 'Pest control', 'Handyman', 'Cleaner'].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Col>
            <Col md={4}>
              <Form.Control placeholder="Company" value={form.company ?? ''} onChange={set('company')} />
            </Col>
            <Col md={4}>
              <Form.Control type="tel" placeholder="Phone" value={form.phone ?? ''} onChange={set('phone')} />
            </Col>
            <Col md={4}>
              <Form.Control type="email" placeholder="Email" value={form.email ?? ''} onChange={set('email')} />
            </Col>
            <Col md={4}>
              <Form.Control placeholder="Notes (rates, reliability…)" value={form.notes ?? ''} onChange={set('notes')} />
            </Col>
          </Row>
          {error && (
            <Alert variant="danger" className="mt-2 mb-0 py-2">
              {error}
            </Alert>
          )}
          <div className="d-flex gap-2 mt-2">
            <Button type="submit" disabled={saving}>
              Save
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
