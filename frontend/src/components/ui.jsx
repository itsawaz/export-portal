import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

// ---------- data hook
export function useApi(path, params) {
  const key = path ? path + JSON.stringify(params || {}) : null
  const [state, setState] = useState({ data: null, error: null, loading: !!path })
  const load = useCallback(async () => {
    if (!path) return
    setState((s) => ({ ...s, loading: true }))
    try { setState({ data: await api(path, { params }), error: null, loading: false }) }
    catch (e) { setState({ data: null, error: e.message, loading: false }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: d })) }
}

// ---------- formatting
export const money = (v, cur = 'USD') =>
  v === null || v === undefined ? '—' : `${cur} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const num = (v, d = 0) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
export const fmtDate = (s) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s + (s.endsWith('Z') ? '' : 'Z')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (s) => (s ? new Date(s + (s.endsWith('Z') ? '' : 'Z')).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
export const label = (s) => (s || '').replaceAll('_', ' ')

// ---------- status badge colours
const TONE = {
  new: 'blue', submitted: 'blue', draft: '', sent: 'blue', quoted: 'green', accepted: 'green', rejected: 'red',
  expired: 'warn', cancelled: 'red', closed: '', contacted: 'kraft', converted: 'green',
  confirmed: 'blue', in_production: 'kraft', ready_to_ship: 'kraft', partially_shipped: 'warn', shipped: 'green', delivered: 'green',
  issued: 'blue', partially_paid: 'warn', paid: 'green', overdue: 'red',
  planned: '', packed: 'kraft', stuffed: 'kraft', gated_in: 'kraft', customs_cleared_origin: 'kraft', sailed: 'blue',
  in_transit: 'blue', arrived: 'green', customs_cleared_dest: 'green',
}
export function Badge({ status, children }) {
  return <span className={`badge ${TONE[status] ?? ''}`}>{children ?? label(status)}</span>
}

// ---------- misc building blocks
export const Loading = () => <div className="empty">Loading…</div>
export const ErrorBox = ({ error }) => (error ? <div className="alert error">{error}</div> : null)
export const Empty = ({ children }) => <div className="empty">{children}</div>

export function Field({ label: l, children, className = '' }) {
  return <label className={`field ${className}`}><span>{l}</span>{children}</label>
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Runs an async action with busy + error state, for buttons and forms.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (fn) => {
    setBusy(true); setError(null)
    try { return await fn() } catch (e) { setError(e.message); return undefined } finally { setBusy(false) }
  }
  return { busy, error, setError, run }
}

export function Table({ columns, rows, onRowClick, empty = 'Nothing here yet.', footer }) {
  if (!rows?.length) return <div className="table-wrap"><Empty>{empty}</Empty></div>
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c.key || c.title} className={c.num ? 'num' : ''}>{c.title}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.key || c.title} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  )
}
