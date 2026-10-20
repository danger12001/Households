import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, ButtonGroup, Card, Col, Form, InputGroup, ListGroup, ProgressBar, Row, Table } from 'react-bootstrap'
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdCollection, useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { useLedgerEntries } from '../hooks/useLedgers'
import { ConfirmButton } from '../components/ConfirmButton'
import { Loading } from '../components/Loading'
import { Money } from '../components/Money'
import { PageHeader } from '../components/PageHeader'
import { ReceiptPicker } from '../components/Receipts'
import { formatDate, todayISO } from '../lib/dates'
import { parseSpreadsheetId, type SyncPlan } from '../lib/ledgerSheet'
import { centsToInput, parseMoney } from '../lib/money'
import { discardReceipts } from '../services/db'
import {
  applyPlan,
  autoPush,
  deleteLedger,
  downloadXlsx,
  ledgerTotal,
  newEntryRef,
  pushToSheet,
  readFilePlan,
  readSheetPlan,
} from '../services/ledgers'
import { cachedSheetsToken, connectGoogleSheets, ensureTab, getSpreadsheetTitle } from '../services/sheets'
import type { Expense, Ledger, LedgerEntry } from '../types'
import { LedgerForm } from './Ledgers'

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export function LedgerDetail() {
  const { id } = useParams()
  const { item: ledger, loading } = useHouseholdDoc<Ledger>('ledgers', id)
  const entries = useLedgerEntries(id)

  if (loading || entries.loading) return <Loading />
  if (!ledger) {
    return (
      <Alert variant="warning">
        That ledger doesn't exist or isn't shared with you. <Link to="/ledgers">Back to ledgers</Link>
      </Alert>
    )
  }
  return <LedgerView ledger={ledger} entries={entries.items} error={entries.error} />
}

function LedgerView({ ledger, entries, error }: { ledger: Ledger; entries: LedgerEntry[]; error: string | null }) {
  const navigate = useNavigate()
  const { household, isLandlord, me, memberName } = useActiveHousehold()
  const [editingLedger, setEditingLedger] = useState(false)
  const [entryForm, setEntryForm] = useState<LedgerEntry | 'new' | null>(null)
  const [notice, setNotice] = useState<{ variant: string; text: string } | null>(null)

  const approved = entries.filter((e) => e.status === 'approved')
  const pending = entries.filter((e) => e.status === 'pending')
  const rejected = entries.filter((e) => e.status === 'rejected')
  const total = ledgerTotal(entries)
  const isTenantOwner = !!me && ledger.tenantId === me.id

  /** After approved entries change, mirror to the sheet if we can do it silently. */
  const afterChange = async () => {
    if (!ledger.sheet) return
    try {
      const pushed = await autoPush(household, ledger)
      if (!pushed) setNotice({ variant: 'info', text: 'Saved. Use "Push to sheet" to update the Google Sheet.' })
    } catch (err) {
      setNotice({ variant: 'warning', text: `Saved, but the Google Sheet wasn't updated: ${errorText(err)}` })
    }
  }

  return (
    <>
      <PageHeader
        title={ledger.name}
        icon="journal-text"
        actions={
          <>
            <Button variant="outline-secondary" onClick={() => void downloadXlsx(household, ledger, entries)}>
              <i className="bi bi-download me-1" />
              .xlsx
            </Button>
            {isLandlord && !editingLedger && (
              <Button variant="outline-secondary" onClick={() => setEditingLedger(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />
      {editingLedger && <LedgerForm ledger={ledger} onDone={() => setEditingLedger(false)} />}
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && (
        <Alert variant={notice.variant} dismissible onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <Row className="g-3 mb-3">
        <Col md={isLandlord ? 6 : 12}>
          <Card className="h-100">
            <Card.Body>
              <div className="small text-secondary">
                {ledger.tenantId ? `Tenant: ${memberName(ledger.tenantId)}` : 'Landlords only'}
                {ledger.description && ` · ${ledger.description}`}
              </div>
              <div className="stat-value">
                <Money cents={total} alwaysConvert />
              </div>
              {ledger.targetCents ? (
                <>
                  <ProgressBar
                    className="mt-2"
                    now={Math.min(100, (total / ledger.targetCents) * 100)}
                    label={`${Math.round((total / ledger.targetCents) * 100)}%`}
                    variant={total >= ledger.targetCents ? 'success' : undefined}
                  />
                  <div className="small text-secondary mt-1">
                    Target <Money cents={ledger.targetCents} alwaysConvert /> ·{' '}
                    {total >= ledger.targetCents ? (
                      'reached'
                    ) : (
                      <>
                        <Money cents={ledger.targetCents - total} noConvert /> to go
                      </>
                    )}
                  </div>
                </>
              ) : null}
              <div className="d-flex flex-wrap gap-2 mt-3">
                {(isLandlord || isTenantOwner) && !entryForm && (
                  <Button onClick={() => setEntryForm('new')}>
                    <i className="bi bi-plus-lg me-1" />
                    {isLandlord ? 'Add entry' : 'Request an entry'}
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
        {isLandlord && (
          <Col md={6}>
            <SyncCard ledger={ledger} entries={entries} onNotice={setNotice} />
          </Col>
        )}
      </Row>

      {entryForm && (
        <EntryForm
          key={entryForm === 'new' ? 'new' : entryForm.id}
          ledger={ledger}
          entry={entryForm === 'new' ? null : entryForm}
          onDone={async (changedApproved) => {
            setEntryForm(null)
            if (changedApproved) await afterChange()
          }}
        />
      )}

      {pending.length > 0 && (
        <Card className="mb-3 border border-warning">
          <Card.Header className="bg-warning-subtle">
            <strong>{isLandlord ? 'Requests to review' : 'Your pending requests'}</strong>
          </Card.Header>
          <ListGroup variant="flush">
            {pending.map((e) => (
              <RequestItem key={e.id} entry={e} onReviewed={(approvedNow) => approvedNow && void afterChange()} />
            ))}
          </ListGroup>
        </Card>
      )}

      <Card className="mb-3">
        <Card.Header className="bg-white">
          <strong>Entries</strong> <span className="text-secondary small">({approved.length})</span>
        </Card.Header>
        <div className="table-responsive">
          <Table hover className="mb-0 align-middle small">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="d-none d-md-table-cell">Who</th>
                <th className="text-end">Amount</th>
                {isLandlord && <th />}
              </tr>
            </thead>
            <tbody>
              {approved.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-secondary">
                    No entries yet.
                  </td>
                </tr>
              )}
              {approved.map((e) => (
                <tr key={e.id}>
                  <td className="text-nowrap">{formatDate(e.date)}</td>
                  <td>
                    {e.description}
                    {e.category && <Badge bg="light" text="dark" className="ms-1">{e.category}</Badge>}
                    {e.receiptIds.length > 0 && <i className="bi bi-paperclip ms-1 text-secondary" />}
                    {e.notes && <div className="text-secondary">{e.notes}</div>}
                    {e.receiptIds.length > 0 && (
                      <div className="mt-1">
                        <ReceiptPicker value={e.receiptIds} readOnly label="" />
                      </div>
                    )}
                  </td>
                  <td className="d-none d-md-table-cell">{e.memberId ? memberName(e.memberId) : ''}</td>
                  <td className={`text-end ${e.amountCents < 0 ? 'text-danger' : ''}`}>
                    <Money cents={e.amountCents} noConvert />
                  </td>
                  {isLandlord && (
                    <td className="text-end text-nowrap">
                      <Button size="sm" variant="link" onClick={() => setEntryForm(e)}>
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      {rejected.length > 0 && (
        <Card className="mb-3">
          <Card.Header className="bg-white">
            <strong>Rejected requests</strong>
          </Card.Header>
          <ListGroup variant="flush">
            {rejected.map((e) => (
              <RequestItem key={e.id} entry={e} />
            ))}
          </ListGroup>
        </Card>
      )}

      {isLandlord && (
        <div className="text-end">
          <ConfirmButton
            confirmLabel="Delete ledger and all entries"
            onConfirm={async () => {
              await deleteLedger(household.id, ledger.id)
              navigate('/ledgers', { replace: true })
            }}
          >
            Delete ledger
          </ConfirmButton>
        </div>
      )}
    </>
  )
}

function RequestItem({ entry, onReviewed }: { entry: LedgerEntry; onReviewed?: (approved: boolean) => void }) {
  const { email } = useAuth()
  const { household, isLandlord, memberName } = useActiveHousehold()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = doc(db, 'households', household.id, 'ledgerEntries', entry.id)

  const review = async (status: 'approved' | 'rejected') => {
    setError(null)
    try {
      await updateDoc(ref, {
        status,
        rejectReason: status === 'rejected' ? reason.trim() : null,
        reviewedBy: email,
        reviewedAt: Date.now(),
      })
      onReviewed?.(status === 'approved')
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <ListGroup.Item>
      <div className="d-flex flex-wrap justify-content-between gap-2">
        <div>
          <strong>{entry.description}</strong> · <Money cents={entry.amountCents} />
          <div className="small text-secondary">
            {formatDate(entry.date)} · requested by {entry.createdBy}
            {entry.memberId && ` · ${memberName(entry.memberId)}`}
          </div>
          {entry.notes && <div className="small">{entry.notes}</div>}
          {entry.status === 'rejected' && (
            <div className="small text-danger">Rejected{entry.rejectReason ? `: ${entry.rejectReason}` : ''}</div>
          )}
        </div>
        <div className="d-flex gap-2 align-items-start">
          {isLandlord && entry.status === 'pending' && !rejecting && (
            <>
              <Button size="sm" variant="success" onClick={() => void review('approved')}>
                Approve
              </Button>
              <Button size="sm" variant="outline-danger" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </>
          )}
          {(isLandlord || entry.createdBy === email) && entry.status !== 'approved' && (
            <ConfirmButton
              size="sm"
              confirmLabel="Delete"
              onConfirm={async () => {
                await discardReceipts(household.id, entry.receiptIds)
                await deleteDoc(ref)
              }}
            >
              <i className="bi bi-trash" />
            </ConfirmButton>
          )}
        </div>
      </div>
      <div className="mt-2">
        <ReceiptPicker value={entry.receiptIds} readOnly label="" />
      </div>
      {rejecting && (
        <InputGroup size="sm" className="mt-2">
          <Form.Control placeholder="Reason (shown to the tenant)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" onClick={() => void review('rejected')}>
            Reject
          </Button>
          <Button variant="outline-secondary" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </InputGroup>
      )}
      {error && <Alert variant="danger" className="mt-2 py-2 small">{error}</Alert>}
    </ListGroup.Item>
  )
}

function EntryForm({
  ledger,
  entry,
  onDone,
}: {
  ledger: Ledger
  entry: LedgerEntry | null
  /** Called with whether approved entries changed (so the sheet needs a push). */
  onDone: (changedApproved: boolean) => void | Promise<void>
}) {
  const { email } = useAuth()
  const { household, isLandlord, members, me } = useActiveHousehold()
  const expenses = useHouseholdCollection<Expense>('expenses')
  const [sign, setSign] = useState<1 | -1>(entry && entry.amountCents < 0 ? -1 : 1)
  const [date, setDate] = useState(entry?.date ?? todayISO())
  const [description, setDescription] = useState(entry?.description ?? '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [memberId, setMemberId] = useState(entry?.memberId ?? (isLandlord ? '' : (me?.id ?? '')))
  const [amountText, setAmountText] = useState(entry ? centsToInput(Math.abs(entry.amountCents)) : '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [receiptIds, setReceiptIds] = useState<string[]>(entry?.receiptIds ?? [])
  const [expenseId, setExpenseId] = useState(entry?.expenseId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const original = entry?.receiptIds ?? []

  const recentExpenses = useMemo(
    () => [...expenses.items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [expenses.items],
  )

  const fromExpense = (id: string) => {
    setExpenseId(id)
    const expense = expenses.items.find((e) => e.id === id)
    if (!expense) return
    setDescription(expense.description)
    setDate(expense.date)
    setCategory(expense.category)
    setAmountText(centsToInput(expense.amountCents))
    setMemberId(expense.paidBy)
    setSign(1)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    const cents = parseMoney(amountText)
    if (!cents) return setError('Enter an amount')
    if (!isLandlord && receiptIds.length === 0) return setError('Attach a photo of the receipt')
    setSaving(true)
    setError(null)
    const data = {
      ledgerId: ledger.id,
      tenantEmail: ledger.tenantEmail,
      date,
      description: description.trim(),
      category: category.trim() || undefined,
      amountCents: sign * cents,
      memberId: memberId || undefined,
      receiptIds,
      notes: notes.trim() || undefined,
      expenseId: expenseId || undefined,
    }
    try {
      if (entry) {
        await updateDoc(doc(db, 'households', household.id, 'ledgerEntries', entry.id), {
          ...data,
          category: data.category ?? null,
          memberId: data.memberId ?? null,
          notes: data.notes ?? null,
          expenseId: data.expenseId ?? null,
        })
      } else {
        const now = Date.now()
        await setDoc(newEntryRef(household.id), {
          ...data,
          status: isLandlord ? 'approved' : 'pending',
          createdBy: email,
          createdAt: now,
          ...(isLandlord ? { reviewedBy: email, reviewedAt: now } : {}),
        })
      }
      await discardReceipts(household.id, original.filter((r) => !receiptIds.includes(r)))
      await onDone(isLandlord)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  const cancel = async () => {
    await discardReceipts(household.id, receiptIds.filter((r) => !original.includes(r)))
    await onDone(false)
  }

  return (
    <Card className="mb-3 border border-primary">
      <Card.Body>
        <h2 className="h6">{entry ? 'Edit entry' : isLandlord ? 'Add entry' : 'Request an entry'}</h2>
        {!isLandlord && (
          <p className="small text-secondary">
            A landlord reviews your request and the receipt photo before it counts towards the total.
          </p>
        )}
        <Form onSubmit={submit}>
          <Row className="g-2">
            {isLandlord && !entry && (
              <Col xs={12}>
                <Form.Select size="sm" value={expenseId} onChange={(e) => fromExpense(e.target.value)}>
                  <option value="">Fill in from a household expense (optional)…</option>
                  {recentExpenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.date} · {e.description} · R{centsToInput(e.amountCents)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            )}
            <Col xs={12} md={4}>
              <ButtonGroup className="w-100">
                <Button variant={sign === 1 ? 'success' : 'outline-success'} onClick={() => setSign(1)}>
                  Adds to total
                </Button>
                <Button variant={sign === -1 ? 'danger' : 'outline-danger'} onClick={() => setSign(-1)}>
                  Subtracts
                </Button>
              </ButtonGroup>
            </Col>
            <Col xs={6} md={4}>
              <InputGroup>
                <InputGroup.Text>R</InputGroup.Text>
                <Form.Control
                  required
                  inputMode="decimal"
                  placeholder="Amount"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col xs={6} md={4}>
              <Form.Control type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Col>
            <Col md={6}>
              <Form.Control
                required
                placeholder="Description (e.g. Seat covers, monthly instalment)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Col>
            <Col xs={6} md={3}>
              <Form.Control placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </Col>
            <Col xs={6} md={3}>
              <Form.Select value={memberId} disabled={!isLandlord} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Who (optional)</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12}>
              <Form.Control placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Col>
          </Row>
          <div className="mt-2">
            <ReceiptPicker
              value={receiptIds}
              onChange={setReceiptIds}
              label={isLandlord ? 'Receipt photos (optional)' : 'Receipt photo (required)'}
            />
          </div>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          <div className="d-flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : entry ? 'Save' : isLandlord ? 'Add entry' : 'Send request'}
            </Button>
            <Button variant="outline-secondary" onClick={() => void cancel()}>
              Cancel
            </Button>
            {entry && isLandlord && (
              <ConfirmButton
                className="ms-auto"
                onConfirm={async () => {
                  await deleteDoc(doc(db, 'households', household.id, 'ledgerEntries', entry.id))
                  await discardReceipts(household.id, entry.receiptIds)
                  await onDone(true)
                }}
              >
                Delete
              </ConfirmButton>
            )}
          </div>
        </Form>
      </Card.Body>
    </Card>
  )
}

function SyncCard({
  ledger,
  entries,
  onNotice,
}: {
  ledger: Ledger
  entries: LedgerEntry[]
  onNotice: (notice: { variant: string; text: string } | null) => void
}) {
  const { email } = useAuth()
  const { household } = useActiveHousehold()
  const [url, setUrl] = useState('')
  const [tab, setTab] = useState('House Hub')
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ plan: SyncPlan; errors: string[]; source: 'sheet' | 'upload' } | null>(null)
  const [replaceOnUpload, setReplaceOnUpload] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const connected = !!cachedSheetsToken()

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    onNotice(null)
    try {
      await action()
    } catch (err) {
      onNotice({ variant: 'danger', text: errorText(err) })
    } finally {
      setBusy(null)
    }
  }

  const link = (event: FormEvent) => {
    event.preventDefault()
    const spreadsheetId = parseSpreadsheetId(url)
    if (!spreadsheetId) return onNotice({ variant: 'danger', text: "That doesn't look like a Google Sheets link" })
    void run('link', async () => {
      const token = await connectGoogleSheets()
      const title = await getSpreadsheetTitle(token, spreadsheetId)
      await ensureTab(token, spreadsheetId, tab.trim())
      const sheet = { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, tab: tab.trim() }
      await updateDoc(doc(db, 'households', household.id, 'ledgers', ledger.id), { sheet })
      const linked = { ...ledger, sheet }
      // An empty ledger adopts whatever is already on the tab; otherwise the app's entries win.
      if (entries.filter((e) => e.status === 'approved').length === 0) {
        const result = await readSheetPlan(token, household, linked, entries)
        if (result.plan.add.length) {
          setPreview({ ...result, source: 'sheet' })
          onNotice({ variant: 'success', text: `Linked to "${title}". Review the rows found on the "${tab}" tab below.` })
          return
        }
      }
      await pushToSheet(token, household, linked)
      onNotice({ variant: 'success', text: `Linked to "${title}" and wrote ${entries.length} entries to the "${tab}" tab.` })
    })
  }

  const apply = () =>
    void run('apply', async () => {
      if (!preview || !email) return
      await applyPlan(household.id, ledger, preview.plan, email, preview.source)
      setPreview(null)
      // Push back so new rows get their Id column filled in.
      if (ledger.sheet) await pushToSheet(cachedSheetsToken() ?? (await connectGoogleSheets()), household, ledger)
      onNotice({ variant: 'success', text: 'Changes applied.' })
    })

  return (
    <Card className="h-100">
      <Card.Header className="bg-white">
        <strong>
          <i className="bi bi-file-earmark-spreadsheet me-1" />
          Spreadsheets
        </strong>
      </Card.Header>
      <Card.Body>
        {ledger.sheet ? (
          <>
            <div className="small mb-2">
              Linked to{' '}
              <a href={ledger.sheet.url} target="_blank" rel="noreferrer">
                Google Sheet <i className="bi bi-box-arrow-up-right" />
              </a>{' '}
              (tab “{ledger.sheet.tab}”)
              <div className="text-secondary">
                {ledger.sheet.lastPushedAt ? `Last pushed ${new Date(ledger.sheet.lastPushedAt).toLocaleString()}` : 'Never pushed'}
                {ledger.sheet.lastPulledAt && ` · last pulled ${new Date(ledger.sheet.lastPulledAt).toLocaleString()}`}
              </div>
              {!connected && <div className="text-secondary">Connect once per session; after that changes push automatically.</div>}
            </div>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  void run('push', async () => {
                    await pushToSheet(await connectGoogleSheets(), household, ledger)
                    onNotice({ variant: 'success', text: 'Google Sheet updated.' })
                  })
                }
              >
                {busy === 'push' ? 'Pushing…' : 'Push to sheet'}
              </Button>
              <Button
                size="sm"
                variant="outline-primary"
                disabled={!!busy}
                onClick={() =>
                  void run('pull', async () => {
                    const result = await readSheetPlan(await connectGoogleSheets(), household, ledger, entries)
                    setPreview({ ...result, source: 'sheet' })
                  })
                }
              >
                {busy === 'pull' ? 'Reading…' : 'Pull changes from sheet'}
              </Button>
              <ConfirmButton
                size="sm"
                confirmLabel="Unlink"
                onConfirm={async () => {
                  await updateDoc(doc(db, 'households', household.id, 'ledgers', ledger.id), { sheet: deleteField() })
                }}
              >
                Unlink
              </ConfirmButton>
            </div>
          </>
        ) : (
          <Form onSubmit={link} className="mb-3">
            <Form.Label className="small">Link a Google Sheet (you need edit access)</Form.Label>
            <Form.Control
              size="sm"
              className="mb-2"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <InputGroup size="sm">
              <InputGroup.Text>Tab</InputGroup.Text>
              <Form.Control value={tab} onChange={(e) => setTab(e.target.value)} />
              <Button type="submit" disabled={!!busy || !url.trim() || !tab.trim()}>
                {busy === 'link' ? 'Linking…' : 'Connect & link'}
              </Button>
            </InputGroup>
          </Form>
        )}

        <div className="small mb-1">Upload a spreadsheet (.xlsx, .xls, .csv)</div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            void run('upload', async () => {
              const result = await readFilePlan(file, household, entries, replaceOnUpload)
              setPreview({ ...result, source: 'upload' })
            })
            e.target.value = ''
          }}
        />
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <Button size="sm" variant="outline-secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <i className="bi bi-upload me-1" />
            {busy === 'upload' ? 'Reading…' : 'Choose file'}
          </Button>
          <Form.Check
            id="replaceOnUpload"
            className="small"
            label="Replace entries (remove ones not in the file)"
            checked={replaceOnUpload}
            onChange={(e) => setReplaceOnUpload(e.target.checked)}
          />
        </div>
        <Form.Text>Columns: Date, Description, Amount (required); Category, Who, Notes, Id (optional).</Form.Text>

        {preview && (
          <Alert variant="light" className="border mt-3 mb-0">
            <strong>{preview.source === 'sheet' ? 'From the Google Sheet' : 'From the file'}:</strong>{' '}
            {preview.plan.add.length} new, {preview.plan.update.length} changed, {preview.plan.remove.length} removed.
            {preview.errors.length > 0 && (
              <ul className="small text-danger mb-1 mt-1">
                {preview.errors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {preview.errors.length > 8 && <li>…and {preview.errors.length - 8} more</li>}
              </ul>
            )}
            {preview.plan.remove.length > 0 && (
              <div className="small text-warning-emphasis">
                Removed entries are deleted from the app.
              </div>
            )}
            <div className="d-flex gap-2 mt-2">
              <Button
                size="sm"
                disabled={!!busy || preview.plan.add.length + preview.plan.update.length + preview.plan.remove.length === 0}
                onClick={apply}
              >
                {busy === 'apply' ? 'Applying…' : 'Apply'}
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={() => setPreview(null)}>
                Discard
              </Button>
            </div>
          </Alert>
        )}
      </Card.Body>
    </Card>
  )
}
