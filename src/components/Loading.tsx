import { Spinner } from 'react-bootstrap'

export function Loading({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div className={`d-flex justify-content-center align-items-center ${fullPage ? 'vh-100' : 'py-5'}`}>
      <Spinner animation="border" role="status" variant="secondary">
        <span className="visually-hidden">Loading…</span>
      </Spinner>
    </div>
  )
}
