import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useBasket } from '../context/BasketContext'
import { BrandMark } from './ProductArt'

// ---------------- company profile (from backend config)
const CompanyCtx = createContext({ name: 'Your Company Exports' })
export const useCompany = () => useContext(CompanyCtx)
export function CompanyProvider({ children }) {
  const [c, setC] = useState({
    name: 'Your Company Exports', tagline: '', email: '', phone: '',
    address: '', city: '', established: '',
    hero_headline: '', hero_subtext: '', about_text: '',
    inquiry_label: 'Get in touch',
    specialty_tags: [], why_us: [], process: [], markets: [], stats: [],
  })
  useEffect(() => { api('/public/company').then(setC).catch(() => {}) }, [])
  useEffect(() => {
    document.title = `${c.name} — ${c.tagline || 'Export Portal'}`
  }, [c])
  return <CompanyCtx.Provider value={c}>{children}</CompanyCtx.Provider>
}

function ScrollTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

// ---------------- public site nav + footer
export function PublicLayout() {
  const company = useCompany()
  const { user } = useAuth()
  const { items } = useBasket()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <>
      <ScrollTop />
      <header className="site-header">
        <div className="container">
          <Link to="/" className="brand"><BrandMark />{company.name}</Link>
          <nav className={`site-nav ${open ? 'open' : ''}`}>
            <NavLink to="/products">Products</NavLink>
            <Link to="/#story">Our Story</Link>
            <Link to="/#process">How We Make It</Link>
            <Link to="/#markets">Export Markets</Link>
            <Link to="/#contact">Contact</Link>
            {/* mobile-only links */}
            <Link className="nav-mobile-only" to={user ? '/portal' : '/login'}>
              {user ? 'My portal' : 'Partner login'}
            </Link>
          </nav>
          <div className="header-actions">
            {/* Only show basket if there are items — keeps portfolio feel */}
            {items.length > 0 && (
              <NavLink to="/basket" className="basket-link">
                Enquiry list <span className="basket-count">{items.length}</span>
              </NavLink>
            )}
            {user
              ? <Link to="/portal" className="btn sm">My portal</Link>
              : <Link to="/#contact" className="btn sm">{company.inquiry_label || 'Get in touch'}</Link>}
          </div>
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <div className="container grid g4">
          <div>
            <div className="footer-brand"><BrandMark style={{ filter: 'brightness(2)' }} /><span style={{ color: '#fff', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: '1.1rem', marginLeft: 10 }}>{company.name}</span></div>
            <p className="footer-tagline">{company.tagline}</p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><Link to="/products">Product range</Link></li>
              <li><Link to="/#story">Our story</Link></li>
              <li><Link to="/#process">How we produce</Link></li>
              <li><Link to="/#markets">Export markets</Link></li>
            </ul>
          </div>
          <div>
            <h4>Work with us</h4>
            <ul>
              <li><Link to="/#contact">{company.inquiry_label || 'Make an enquiry'}</Link></li>
              <li><Link to="/track">Track a shipment</Link></li>
              <li><Link to="/login">Partner portal login</Link></li>
              <li><Link to="/register">Open a buyer account</Link></li>
            </ul>
          </div>
          <div>
            <h4>Head office</h4>
            <ul>
              <li style={{ lineHeight: 1.5 }}>{company.address}</li>
              <li><a href={`mailto:${company.email}`}>{company.email}</a></li>
              <li><a href={`tel:${company.phone}`}>{company.phone}</a></li>
            </ul>
          </div>
        </div>
        <div className="container legal row between">
          <span>© {new Date().getFullYear()} {company.name}. All rights reserved.</span>
          <span>Privacy · Terms · Export compliance</span>
        </div>
      </footer>
    </>
  )
}

// ---------------- portal (buyer + back office)
const BUYER_NAV = [
  ['Overview', '/portal', true],
  ['My RFQs', '/portal/rfqs'],
  ['Quotations', '/portal/quotes'],
  ['Orders', '/portal/orders'],
  ['Shipments', '/portal/shipments'],
  ['Invoices', '/portal/invoices'],
  ['Company profile', '/portal/profile'],
]
const STAFF_NAV = [
  ['Dashboard', '/portal', true],
  { group: 'Sales' },
  ['Enquiries', '/portal/enquiries'],
  ['RFQs', '/portal/rfqs'],
  ['Quotations', '/portal/quotes'],
  ['Sales orders', '/portal/orders'],
  { group: 'Logistics & finance' },
  ['Shipments', '/portal/shipments'],
  ['Invoices', '/portal/invoices'],
  ['Payments', '/portal/payments'],
  { group: 'Master data' },
  ['Customers', '/portal/customers'],
  ['Catalogue', '/portal/catalogue'],
  ['Users', '/portal/users', false, true],
]

export function PortalLayout() {
  const { user, ready, isStaff, isAdmin, logout } = useAuth()
  const company = useCompany()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  if (!ready) return null
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />
  const nav = isStaff ? STAFF_NAV : BUYER_NAV

  return (
    <div className="portal">
      <ScrollTop />
      <div className="mobile-bar">
        <button onClick={() => setOpen(true)} aria-label="Menu">☰</button>
        <span>{company.name}</span><span />
      </div>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand"><BrandMark />{company.name}</Link>
        <nav>
          {nav.map((n, i) => {
            if (n.group) return <div className="group" key={i}>{n.group}</div>
            const [text, to, end, adminOnly] = n
            if (adminOnly && !isAdmin) return null
            return <NavLink key={to} to={to} end={end}>{text}</NavLink>
          })}
          <div className="group">Account</div>
          {!isStaff && <NavLink to="/products">Browse catalogue</NavLink>}
          {!isStaff && <NavLink to="/basket">Enquiry list</NavLink>}
          <a href="/" onClick={(e) => { e.preventDefault(); logout(); window.location.href = '/' }}>Sign out</a>
        </nav>
        <div className="small" style={{ margin: '28px 10px 0', color: '#8b978d' }}>
          Signed in as<br /><span style={{ color: '#dfe5de' }}>{user.full_name || user.email}</span><br />
          {user.customer?.company_name || label(user.role)}
        </div>
      </aside>
      {open && <div className="modal-bg" style={{ zIndex: 40 }} onClick={() => setOpen(false)} />}
      <main className="portal-main"><Outlet /></main>
    </div>
  )
}
const label = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function PageHead({ title, sub, children }) {
  return (
    <div className="portal-top">
      <div>
        <h1>{title}</h1>
        {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
      </div>
      <div className="row">{children}</div>
    </div>
  )
}
