import type { ReactNode } from 'react'

export function PageHeader({ title, icon, actions }: { title: string; icon?: string; actions?: ReactNode }) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h1 className="h4 mb-0">
        {icon && <i className={`bi bi-${icon} me-2`} />}
        {title}
      </h1>
      {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
