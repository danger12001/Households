import { useState, type ReactNode } from 'react'
import { Button, type ButtonProps } from 'react-bootstrap'

/** A button that asks "Sure?" inline on first click instead of a browser confirm(). */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Yes, delete',
  ...props
}: ButtonProps & { onConfirm: () => void | Promise<void>; confirmLabel?: string; children: ReactNode }) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <Button variant="outline-danger" {...props} onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }
  return (
    <span className="d-inline-flex gap-2">
      <Button
        variant="danger"
        size={props.size}
        disabled={props.disabled}
        onClick={async () => {
          await onConfirm()
          setAsking(false)
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="outline-secondary" size={props.size} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  )
}
