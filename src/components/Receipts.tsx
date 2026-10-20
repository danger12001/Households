import { useRef, useState } from 'react'
import { Alert, Button, CloseButton, Modal, Spinner } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { useHouseholdDoc } from '../hooks/useHouseholdCollection'
import { uploadReceipt } from '../services/db'
import type { Receipt } from '../types'

function ReceiptThumb({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const { item, loading } = useHouseholdDoc<Receipt>('receipts', id)
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div className="receipt-thumb d-flex align-items-center justify-content-center">
        <Spinner size="sm" />
      </div>
    )
  }
  if (!item) {
    return (
      <div className="receipt-thumb d-flex align-items-center justify-content-center text-secondary" title="Missing">
        <i className="bi bi-image-alt" />
      </div>
    )
  }
  return (
    <div className="position-relative">
      <img src={item.dataUrl} alt="Receipt" className="receipt-thumb" onClick={() => setOpen(true)} />
      {onRemove && (
        <CloseButton
          className="position-absolute top-0 end-0 bg-white rounded-circle p-1"
          style={{ transform: 'translate(35%, -35%)' }}
          aria-label="Remove photo"
          onClick={onRemove}
        />
      )}
      <Modal show={open} onHide={() => setOpen(false)} size="lg" centered>
        <Modal.Header closeButton>Receipt</Modal.Header>
        <Modal.Body className="text-center">
          <img src={item.dataUrl} alt="Receipt" className="img-fluid" />
        </Modal.Body>
      </Modal>
    </div>
  )
}

/**
 * Photo attachments. Uploads happen immediately (so the form can save just
 * the ids); removed photos are reported to the parent, which deletes them on save.
 */
export function ReceiptPicker({
  value,
  onChange,
  readOnly = false,
  label = 'Receipt photos',
}: {
  value: string[]
  onChange?: (ids: string[]) => void
  readOnly?: boolean
  label?: string
}) {
  const { household } = useActiveHousehold()
  const { email } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !email || !onChange) return
    setUploading(true)
    setError(null)
    const ids = [...value]
    try {
      for (const file of Array.from(files)) {
        ids.push(await uploadReceipt(household.id, file, email))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      onChange(ids)
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (readOnly && value.length === 0) return null

  return (
    <div className="mb-3">
      <div className="form-label">{label}</div>
      <div className="d-flex flex-wrap gap-2 align-items-center">
        {value.map((id) => (
          <ReceiptThumb
            key={id}
            id={id}
            onRemove={readOnly || !onChange ? undefined : () => onChange(value.filter((v) => v !== id))}
          />
        ))}
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void addFiles(e.target.files)}
            />
            <Button
              variant="outline-secondary"
              className="receipt-thumb d-flex flex-column align-items-center justify-content-center"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Spinner size="sm" /> : <i className="bi bi-camera fs-4" />}
              <span className="small">{uploading ? '' : 'Add'}</span>
            </Button>
          </>
        )}
      </div>
      {error && (
        <Alert variant="danger" className="mt-2 py-2 small">
          {error}
        </Alert>
      )}
    </div>
  )
}
