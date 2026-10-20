import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Badge, Container, Nav, Navbar, NavDropdown } from 'react-bootstrap'
import { useAuth } from '../contexts/AuthContext'
import { useActiveHousehold } from '../contexts/HouseholdContext'

const LINKS = [
  { to: '/', label: 'Home', icon: 'house' },
  { to: '/rent', label: 'Rent', icon: 'house-check' },
  { to: '/expenses', label: 'Expenses', icon: 'receipt' },
  { to: '/balances', label: 'Balances', icon: 'arrow-left-right' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar-week' },
  { to: '/contractors', label: 'Contractors', icon: 'tools' },
  { to: '/utilities', label: 'Utilities', icon: 'lightning-charge' },
  { to: '/ledgers', label: 'Ledgers', icon: 'journal-text' },
  { to: '/household', label: 'Household', icon: 'people' },
]

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { household, households, selectHousehold, isLandlord, me } = useActiveHousehold()
  const [expanded, setExpanded] = useState(false)
  const close = () => setExpanded(false)

  return (
    <>
      <Navbar bg="dark" data-bs-theme="dark" expand="lg" sticky="top" expanded={expanded} onToggle={setExpanded}>
        <Container>
          <Navbar.Brand as={Link} to="/" onClick={close}>
            <i className="bi bi-house-heart" />
            {household.name}
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="main-nav" />
          <Navbar.Collapse id="main-nav">
            <Nav className="me-auto">
              {LINKS.map((link) => (
                <Nav.Link key={link.to} as={NavLink} to={link.to} end={link.to === '/'} onClick={close}>
                  <i className={`bi bi-${link.icon} me-1`} />
                  {link.label}
                </Nav.Link>
              ))}
            </Nav>
            <Nav>
              <NavDropdown
                align="end"
                title={
                  <>
                    <i className="bi bi-person-circle me-1" />
                    {me?.name ?? user?.displayName ?? user?.email}{' '}
                    <Badge bg={isLandlord ? 'warning' : 'secondary'} text={isLandlord ? 'dark' : undefined}>
                      {isLandlord ? 'Landlord' : 'Tenant'}
                    </Badge>
                  </>
                }
              >
                <NavDropdown.ItemText className="small text-secondary">{user?.email}</NavDropdown.ItemText>
                {households.length > 1 && (
                  <>
                    <NavDropdown.Divider />
                    <NavDropdown.Header>Switch household</NavDropdown.Header>
                    {households.map((h) => (
                      <NavDropdown.Item
                        key={h.id}
                        active={h.id === household.id}
                        onClick={() => {
                          selectHousehold(h.id)
                          close()
                        }}
                      >
                        {h.name}
                      </NavDropdown.Item>
                    ))}
                  </>
                )}
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={() => void signOut()}>
                  <i className="bi bi-box-arrow-right me-1" />
                  Sign out
                </NavDropdown.Item>
              </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container as="main" className="app-main">
        <Outlet />
      </Container>
    </>
  )
}
