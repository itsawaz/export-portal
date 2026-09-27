import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, openPdf } from '../../api'
import { LinesTable, TermsCard } from '../../components/Docs'
import { PageHead } from '../../components/Layouts'
import { Badge, ErrorBox, Field, fmtDate, Loading, Modal, money, num, Table, useAction, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { Flash, useStatusParam } from './Sales'

const ORDER_STATUSES = ['confirmed', 'in_production', 'ready_to_ship', 'partially_shipped', 'shipped', 'delivered', 'closed', 'cancelled']

export function OrderList() {
  const status = useStatusParam()
  const { data, error, loading } = useApi('/orders', { status })
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <PageHead title={isStaff ? 'Sales orders' : 'My orders'} />
      <div className="chips" style={{ marginBottom: 16 }}>
        {['', ...ORDER_STATUSES].map((s) => <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => navigate(s ? `?status=${s}` : '?')}>{s ? s.replaceAll('_', ' ') : 'All'}</button>)}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(o) => navigate(`/portal/orders/${o.id}`)} empty="No orders yet." columns={[
          { title: 'Order', render: (o) => <><b>{o.number}</b><div className="small muted">{o.pi_number}</div></> },
          ...(isStaff ? [{ title: 'Customer', render: (o) => o.customer.company_name }] : []),
          { title: 'Buyer PO', key: 'buyer_po' },
          { title: 'Date', render: (o) => fmtDate(o.order_date) },
          { title: 'Shipped', render: (o) => `${num(o.shipped_cartons)} / ${num(o.ordered_cartons)} ctn` },
          { title: 'Total', num: true, render: (o) => money(o.total, o.currency) },
          { title: 'Balance', num: true, render: (o) => money(o.balance_due, o.currency) },
          { title: 'Status', render: (o) => <Badge status={o.status} /> },
        ]} />
      )}
    </>
  )
}

// ---------- modals (staff)
export function PaymentModal({ order, invoice, onClose, onDone }) {
  const [f, setF] = useState({ amount: invoice ? invoice.balance : '', method: 'TT', reference: '', received_on: new Date().toISOString().slice(0, 10), inr_amount: '', notes: '', invoice_id: invoice?.id || '' })
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api('/payments', { method: 'POST', body: { ...f, order_id: order.id, currency: order.currency, amount: Number(f.amount), inr_amount: Number(f.inr_amount || 0), invoice_id: f.invoice_id ? Number(f.invoice_id) : null } })
      onDone()
    })
  }
  const invoices = order.invoices?.filter((i) => i.status !== 'cancelled') || []
  return (
    <Modal title={`Record payment · ${order.number}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`Amount (${order.currency})`}><input type="number" step="0.01" min="0.01" required value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Method"><select value={f.method} onChange={set('method')}>{['TT', 'LC', 'DP', 'DA', 'advance', 'other'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Received on"><input type="date" value={f.received_on} onChange={set('received_on')} /></Field>
        <Field label="Reference (SWIFT / UTR / LC no.)"><input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Apply to invoice">
          <select value={f.invoice_id} onChange={set('invoice_id')}>
            <option value="">Advance against order (allocate later)</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · balance {money(i.balance, i.currency)}</option>)}
          </select>
        </Field>
        <Field label="Realised INR (for BRC/FIRC)"><input type="number" step="0.01" value={f.inr_amount} onChange={set('inr_amount')} /></Field>
        <Field label="Notes" className="span2"><input value={f.notes} onChange={set('notes')} /></Field>
        {error && <div className="alert error span2">{error}</div>}
        <div className="span2 row"><button className="btn" disabled={busy}>Save payment</button><button type="button" className="btn light" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}

function ShipmentModal({ order, onClose, onDone }) {
  const pending = order.items.filter((i) => i.pending_cartons > 0)
  const [qty, setQty] = useState(Object.fromEntries(pending.map((i) => [i.id, i.pending_cartons])))
  const [f, setF] = useState({ mode: 'sea', container_type: '20GP', carrier: '', forwarder: '', vessel_voyage: '', container_no: '', seal_no: '', bl_awb_no: '', etd: '', eta: '', port_of_loading: order.port_of_loading, port_of_discharge: order.port_of_discharge })
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    const items = Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ order_item_id: Number(id), qty_cartons: Number(q) }))
    run(async () => { const s = await api('/shipments', { method: 'POST', body: { ...f, etd: f.etd || null, eta: f.eta || null, order_id: order.id, items } }); onDone(s) })
  }
  return (
    <Modal title={`New shipment · ${order.number}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="table-wrap line-edit"><table>
          <thead><tr><th>Line</th><th className="num">Pending</th><th>Ship now (ctn)</th></tr></thead>
          <tbody>{pending.map((i) => (
            <tr key={i.id}><td>{i.description}</td><td className="num">{i.pending_cartons}</td>
              <td><input type="number" min={0} max={i.pending_cartons} value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} style={{ width: 100 }} /></td></tr>
          ))}</tbody>
        </table></div>
        <div className="form-grid">
          <Field label="Mode"><select value={f.mode} onChange={set('mode')}>{['sea', 'air', 'courier', 'road'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Container"><select value={f.container_type} onChange={set('container_type')}>{['20GP', '40GP', '40HC', 'LCL', 'n/a'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Shipping line / carrier"><input value={f.carrier} onChange={set('carrier')} /></Field>
          <Field label="Forwarder / CHA"><input value={f.forwarder} onChange={set('forwarder')} /></Field>
          <Field label="Port of loading"><input value={f.port_of_loading} onChange={set('port_of_loading')} /></Field>
          <Field label="Port of discharge"><input value={f.port_of_discharge} onChange={set('port_of_discharge')} /></Field>
          <Field label="ETD"><input type="date" value={f.etd} onChange={set('etd')} /></Field>
          <Field label="ETA"><input type="date" value={f.eta} onChange={set('eta')} /></Field>
        </div>
        <p className="small muted">Container, seal, vessel and B/L numbers can be added later from the shipment page.</p>
        <ErrorBox error={error} />
        <div className="row"><button className="btn" disabled={busy}>Create shipment</button><button type="button" className="btn light" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}

// ---------- detail
export function OrderDetail() {
  const { id } = useParams()
  const { data: o, error, reload } = useApi(`/orders/${id}`)
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('items')
  const [modal, setModal] = useState(null)
  const act = useAction()
  if (error) return <ErrorBox error={error} />
  if (!o) return <Loading />
  const setStatus = (status) => act.run(async () => { await api(`/orders/${o.id}/status`, { method: 'POST', body: { status } }); reload() })
  const pendingCartons = o.items.reduce((s, i) => s + i.pending_cartons, 0)
  const open = !['cancelled', 'closed'].includes(o.status)

  return (
    <>
      <Flash />
      <PageHead title={o.number} sub={`${o.customer.company_name} · PI ${o.pi_number} · PO ${o.buyer_po || '—'} · ${fmtDate(o.order_date)}`}>
        <Badge status={o.status} />
        <button className="btn light" onClick={() => openPdf(`/orders/${o.id}/proforma.pdf`)}>Proforma invoice PDF</button>
        {isStaff && open && <button className="btn light" onClick={() => setModal('pay')}>Record payment</button>}
        {isStaff && open && pendingCartons > 0 && <button className="btn" onClick={() => setModal('ship')}>Create shipment</button>}
      </PageHead>
      <ErrorBox error={act.error} />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="kpi"><span>Order total</span><b>{money(o.total, o.currency)}</b></div>
        <div className="kpi"><span>Received</span><b>{money(o.paid, o.currency)}</b></div>
        <div className="kpi"><span>Balance</span><b>{money(o.balance_due, o.currency)}</b></div>
        <div className="kpi"><span>Shipped</span><b>{num(o.shipped_cartons)} / {num(o.ordered_cartons)} ctn</b></div>
      </div>

      {isStaff && open && (
        <div className="row card flat" style={{ marginBottom: 20, padding: 14 }}>
          <span className="small muted">Production status:</span>
          {['confirmed', 'in_production', 'ready_to_ship'].map((s) => (
            <button key={s} className={`chip ${o.status === s ? 'active' : ''}`} disabled={act.busy} onClick={() => setStatus(s)}>{s.replaceAll('_', ' ')}</button>
          ))}
          <span className="small muted" style={{ marginLeft: 'auto' }}>Shipped / delivered / closed update automatically from shipments and payments.</span>
          {!o.shipments.length && !o.payments.length && <button className="linkbtn danger small" onClick={() => confirm('Cancel this order?') && setStatus('cancelled')}>Cancel order</button>}
        </div>
      )}

      <div className="tabs">
        {[['items', 'Items'], ['shipments', `Shipments (${o.shipments.length})`], ['invoices', `Invoices (${o.invoices.length})`], ['payments', `Payments (${o.payments.length})`], ['terms', 'Terms']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'items' && <LinesTable doc={o} extraCols={[{ title: 'Shipped', render: (i) => num(i.shipped_cartons) }, { title: 'Pending', render: (i) => num(i.pending_cartons) }]} />}
      {tab === 'shipments' && <Table rows={o.shipments} empty="No shipments yet." onRowClick={(s) => navigate(`/portal/shipments/${s.id}`)} columns={[
        { title: 'Shipment', render: (s) => <b>{s.number}</b> }, { title: 'Container', render: (s) => <span className="mono">{s.container_no || '—'}</span> },
        { title: 'Vessel', key: 'vessel_voyage' }, { title: 'Cartons', num: true, key: 'total_cartons' },
        { title: 'ETD', render: (s) => fmtDate(s.etd) }, { title: 'ETA', render: (s) => fmtDate(s.eta) },
        { title: 'Status', render: (s) => <Badge status={s.status}>{s.status_label}</Badge> },
      ]} />}
      {tab === 'invoices' && <Table rows={o.invoices} empty="Invoices are raised per shipment." onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)} columns={[
        { title: 'Invoice', render: (i) => <b>{i.number}</b> }, { title: 'Shipment', key: 'shipment_number' },
        { title: 'Date', render: (i) => fmtDate(i.invoice_date) }, { title: 'Due', render: (i) => fmtDate(i.due_date) },
        { title: 'Total', num: true, render: (i) => money(i.total, i.currency) }, { title: 'Balance', num: true, render: (i) => money(i.balance, i.currency) },
        { title: 'Status', render: (i) => <Badge status={i.status} /> },
      ]} />}
      {tab === 'payments' && <Table rows={o.payments} empty="No payments recorded." columns={[
        { title: 'Date', render: (p) => fmtDate(p.received_on) }, { title: 'Method', key: 'method' }, { title: 'Reference', key: 'reference' },
        { title: 'Applied to', render: (p) => p.invoice_number ? <Link to={`/portal/invoices/${p.invoice_id}`}>{p.invoice_number}</Link> : 'Advance (unallocated)' },
        { title: 'Amount', num: true, render: (p) => money(p.amount, p.currency) },
      ]} />}
      {tab === 'terms' && <TermsCard doc={o}><dt>Expected ship date</dt><dd>{fmtDate(o.expected_ship_date)}</dd>{o.quotation_number && <><dt>Quotation</dt><dd><Link to={`/portal/quotes/${o.quotation_id}`}>{o.quotation_number}</Link></dd></>}</TermsCard>}

      {modal === 'pay' && <PaymentModal order={o} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
      {modal === 'ship' && <ShipmentModal order={o} onClose={() => setModal(null)} onDone={(s) => navigate(`/portal/shipments/${s.id}`)} />}
    </>
  )
}
