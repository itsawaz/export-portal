import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Field, useAction } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

function useNext() {
  const [p] = useSearchParams()
  const next = p.get('next')
  return next && next.startsWith('/') ? next : '/portal'
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const next = useNext()
  const [f, setF] = useState({ email: '', password: '' })
  const { busy, error, run } = useAction()
  const submit = (e) => { e.preventDefault(); run(async () => { await login(f.email, f.password); navigate(next) }) }
  return (
    <div className="auth-page">
      <form className="card auth-card stack" onSubmit={submit}>
        <div><div className="eyebrow">Buyer & staff portal</div><h2>Sign in</h2></div>
        <Field label="E-mail"><input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password"><input type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {error && <div className="alert error">{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted">New buyer? <Link to={`/register?next=${encodeURIComponent(next)}`}>Open an account</Link></p>
        <div className="demo-creds">
          <b>Demo accounts</b> (remove in production)<br />
          Admin: admin@example.com / Admin@123<br />Staff: staff@example.com / Staff@123<br />Buyer: buyer@example.com / Buyer@123
        </div>
      </form>
    </div>
  )
}

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const next = useNext()
  const [f, setF] = useState({ full_name: '', email: '', password: '', company_name: '', country: '', phone: '', address: '', tax_id: '' })
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => { e.preventDefault(); run(async () => { await register(f); navigate(next) }) }
  return (
    <div className="auth-page">
      <form className="card auth-card" style={{ width: 'min(640px, 100%)' }} onSubmit={submit}>
        <div className="eyebrow">For importers, distributors & food-service chains</div>
        <h2>Open a buyer account</h2>
        <p className="muted small">See indicative prices, request quotations, confirm orders, download documents and track shipments.</p>
        <div className="form-grid">
          <Field label="Your name"><input required value={f.full_name} onChange={set('full_name')} /></Field>
          <Field label="Work e-mail"><input type="email" required value={f.email} onChange={set('email')} /></Field>
          <Field label="Company"><input required value={f.company_name} onChange={set('company_name')} /></Field>
          <Field label="Country"><input required value={f.country} onChange={set('country')} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="VAT / Tax ID"><input value={f.tax_id} onChange={set('tax_id')} /></Field>
          <Field label="Address" className="span2"><textarea value={f.address} onChange={set('address')} style={{ minHeight: 60 }} /></Field>
          <Field label="Password (min. 8 characters)" className="span2"><input type="password" minLength={8} required autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          {error && <div className="alert error span2">{error}</div>}
          <button className="btn span2" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          <p className="small muted span2">Already registered? <Link to="/login">Sign in</Link></p>
        </div>
      </form>
    </div>
  )
}
