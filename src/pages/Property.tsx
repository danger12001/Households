import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Col, Form, Row } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection } from '../hooks/useHouseholdCollection'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { ASSET_TYPES, assetType, isLowStock, latestReadings, readingStatus } from '../lib/assets'
import { formatDateTime } from '../lib/dates'
import { createAsset } from '../services/assets'
import type { Asset, AssetLog, Supply } from '../types'

export function Property() {
  const { isLandlord } = useActiveHousehold()
  const assets = useHouseholdCollection<Asset>('assets')
  const logs = useHouseholdCollection<AssetLog>('assetLogs')
  const supplies = useHouseholdCollection<Supply>('supplies')
  const [creating, setCreating] = useState(false)

  const sorted = useMemo(() => [...assets.items].sort((a, b) => a.name.localeCompare(b.name)), [assets.items])

  return (
    <>
      <PageHeader
        title="Property"
        icon="tree"
        actions={
          isLandlord &&
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <i className="bi bi-plus-lg me-1" />
              Add
            </Button>
          )
        }
      />
      <p className="text-secondary small">
        The pool and anything else on the property that needs looking after: water tests and readings, maintenance,
        and stock of chemicals and supplies.
      </p>
      {assets.error && <Alert variant="danger">{assets.error}</Alert>}
      {creating && <AssetForm onDone={() => setCreating(false)} />}
      {assets.loading ? (
        <Loading />
      ) : sorted.length === 0 ? (
        <Card body className="text-secondary">
          Nothing added yet{isLandlord ? ' – start with the pool.' : '.'}
        </Card>
      ) : (
        <Row className="g-3">
          {sorted.map((asset) => {
            const def = assetType(asset.type)
            const own = logs.items.filter((l) => l.assetId === asset.id)
            const latest = latestReadings(own)
            const outOfRange = def.readings.filter((r) => ['low', 'high'].includes(readingStatus(latest[r.key]?.value, r)))
            const low = supplies.items.filter((s) => s.assetId === asset.id && isLowStock(s))
            const lastLog = [...own].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]
            return (
              <Col md={6} lg={4} key={asset.id}>
                <Card as={Link} to={`/property/${asset.id}`} className="h-100 text-reset text-decoration-none">
                  <Card.Body>
                    <div className="d-flex justify-content-between gap-2">
                      <strong>
                        <i className={`bi bi-${def.icon} me-2`} />
                        {asset.name}
                      </strong>
                      <span className="text-secondary small">{def.label}</span>
                    </div>
                    <div className="small text-secondary mt-1">
                      {lastLog ? `Last logged ${formatDateTime(lastLog.takenAt)}` : 'Nothing logged yet'}
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {outOfRange.map((r) => (
                        <Badge key={r.key} bg="danger">
                          {r.label} {readingStatus(latest[r.key]?.value, r)}
                        </Badge>
                      ))}
                      {def.readings.length > 0 && lastLog && outOfRange.length === 0 && <Badge bg="success">Readings OK</Badge>}
                      {low.length > 0 && (
                        <Badge bg="warning" text="dark">
                          {low.length} low on stock
                        </Badge>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}
    </>
  )
}

function AssetForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { household } = useActiveHousehold()
  const [type, setType] = useState('pool')
  const [name, setName] = useState('Pool')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const id = await createAsset(household.id, { name: name.trim(), type, details: {}, createdAt: Date.now() })
      navigate(`/property/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        <Form onSubmit={submit}>
          <Row className="g-2 align-items-end">
            <Col xs={6} md={4}>
              <Form.Label className="small">Type</Form.Label>
              <Form.Select
                value={type}
                onChange={(e) => {
                  // Keep a name the user typed; otherwise follow the type.
                  if (name === assetType(type).label) setName(assetType(e.target.value).label)
                  setType(e.target.value)
                }}
              >
                {Object.entries(ASSET_TYPES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={4}>
              <Form.Label className="small">Name</Form.Label>
              <Form.Control required value={name} onChange={(e) => setName(e.target.value)} />
            </Col>
            <Col md={4} className="d-flex gap-2">
              <Button type="submit" disabled={saving}>
                Add
              </Button>
              <Button variant="outline-secondary" onClick={onDone}>
                Cancel
              </Button>
            </Col>
          </Row>
          {assetType(type).supplies.length > 0 && (
            <Form.Text>
              Starts with a stock list of {assetType(type).supplies.map((s) => s.name.toLowerCase()).join(', ')} (at zero –
              enter what you have).
            </Form.Text>
          )}
          {error && <Alert variant="danger" className="mt-2 py-2">{error}</Alert>}
        </Form>
      </Card.Body>
    </Card>
  )
}
