import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** A router link styled as a Bootstrap button (react-bootstrap's Button `as={Link}` loses the `to` typing). */
export function LinkButton({
  to,
  variant = 'primary',
  size,
  className,
  children,
}: {
  to: string
  variant?: string
  size?: 'sm' | 'lg'
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={['btn', `btn-${variant}`, size && `btn-${size}`, className].filter(Boolean).join(' ')}>
      {children}
    </Link>
  )
}
