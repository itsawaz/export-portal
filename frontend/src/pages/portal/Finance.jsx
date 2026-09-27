import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, openPdf } from '../../api'
import { LinesTable, TermsCard } from '../../components/Docs'
import { PageHead } from '../../components/Layouts'
import { Badge, ErrorBox, fmtDate, Loading, money, num, Table, useAction, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { PaymentModal } from './Orders'
import { useStatusParam } from './Sales'

const isOverdue = (i) => ['issued', 'partially_paid'].includes(i.status) && i.due_date && new Date(i.due_date) < new Date(new Date().toDateString())

export function InvoiceList() {
  const status = useStatusParam()
  const { data, error, loading } = useApi('/invoices', { status })
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const open = data?.filter((i) => ['issued', 'partially_paid'].includes(i.status)) || []
  return (
    <>
      <PageHead title="Invoices" sub={data ? `${open.length} open · outstanding ${money(open.reduce((s, i) => s + i.balance, 0))}` : ''} />
      <div className="chips" style={{ marginBottom: 16 }}>
        {['', 'issued', 'partially_paid', 'paid', 'cancelled'].map((s) => <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => navigate(s ? `?status=${s}` : '?')}>{s ? s.replaceAll('_', ' ') : 'All'}</button>)}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)} empty="No invoices." columns={[
          { title: 'Invoice', render: (i) => <b>{i.number}</b> },
          ...(isStaff ? [{ title: 'Customer', render: (i) => i.customer.company_name }] : []),
          { title: 'Order', key: 'order_number' },
          { title: 'Date', render: (i) => fmtDate(i.invoice_date) },
          { title: 'Due', render: (i) => <span style={isOverdue(i) ? { color: 'var(--danger)', fontWeight: 600 } : null}>{fmtDate(i.due_date)}</span> },
          { title: 'Total', num: true, render: (i) => money(i.total, i.currency) },
          { title: 'Balance', num: true, render: (i) => money(i.balance, i.currency) },
          { title: 'Status', render: (i) => <Badge status={isOverdue(i) ? 'overdue' : i.status}>{isOverdue(i) ? 'overdue' : undefined}</Badge> },
        ]} />
      )}
    </>
  )
}

export function InvoiceDetail() {
  const { id } = useParams()
  const { data: inv, error, reload } = useApi(`/invoices/${id}`)
  const { isStaff } = useAuth()
  const [paying, setPaying] = useState(false)
  const act = useAction()
  if (error) return <ErrorBox error={error} />
  if (!inv) return <Loading />
  const cancel = () => confirm('Cancel this invoice?') && act.run(async () => { await api(`/invoices/${inv.id}/cancel`, { method: 'POST' }); reload() })
  const order = { id: inv.order_id, number: inv.order_number, currency: inv.currency, invoices: [inv] }

  return (
    <>
      <PageHead title={`Commercial invoice ${inv.number}`} sub={<>Order <Link to={`/portal/orders/${inv.order_id}`}>{inv.order_number}</Link>{inv.shipment_id && <> · Shipment <Link to={`/portal/shipments/${inv.shipment_id}`}>{inv.shipment_number}</Link></>}</>}>
        <Badge status={isOverdue(inv) ? 'overdue' : inv.status}>{isOverdue(inv) ? 'overdue' : undefined}</Badge>
        <button className="btn light" onClick={() => openPdf(`/invoices/${inv.id}/pdf`)}>Invoice PDF</button>
        <button className="btn light" onClick={() => openPdf(`/invoices/${inv.id}/packing-list.pdf`)}>Packing list PDF</button>
        {isStaff && inv.status !== 'cancelled' && inv.balance > 0 && <button className="btn" onClick={() => setPaying(true)}>Record payment</button>}
        {isStaff && inv.status === 'issued' && !inv.payments.length && <button className="btn light" onClick={cancel}>Cancel invoice</button>}
      </PageHead>
      <ErrorBox error={act.error} />
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="kpi"><span>Invoice total</span><b>{money(inv.total, inv.currency)}</b></div>
        <div className="kpi"><span>Paid</span><b>{money(inv.amount_paid, inv.currency)}</b></div>
        <div className={`kpi ${isOverdue(inv) ? 'alert-kpi' : ''}`}><span>Balance</span><b>{money(inv.balance, inv.currency)}</b></div>
        <div className="kpi"><span>Due date</span><b>{fmtDate(inv.due_date)}</b></div>
      </div>
      <div className="grid split">
        <div className="stack">
          <LinesTable doc={inv} />
          <h3>Payments</h3>
          <Table rows={inv.payments} empty="No payments applied yet." columns={[
            { title: 'Date', render: (p) => fmtDate(p.received_on) }, { title: 'Method', key: 'method' },
            { title: 'Reference', key: 'reference' }, { title: 'Amount', num: true, render: (p) => money(p.amount, p.currency) },
          ]} />
        </div>
        <TermsCard doc={inv}><dt>Invoice date</dt><dd>{fmtDate(inv.invoice_date)}</dd></TermsCard>
      </div>
      {paying && <PaymentModal order={order} invoice={inv} onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload() }} />}
    </>
  )
}

export function PaymentList() {
  const { data, error, loading, reload } = useApi('/payments')
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const act = useAction()
  const del = (p) => confirm(`Delete payment of ${money(p.amount, p.currency)}?`) && act.run(async () => { await api(`/payments/${p.id}`, { method: 'DELETE' }); reload() })
  const total = data?.reduce((s, p) => s + (p.currency === 'USD' ? p.amount : 0), 0)
  return (
    <>
      <PageHead title="Payments received" sub={data ? `USD total ${money(total)} · ${num(data.length)} receipts` : ''} />
      <ErrorBox error={error || act.error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} empty="No payments recorded." columns={[
          { title: 'Date', render: (p) => fmtDate(p.received_on) },
          { title: 'Order', render: (p) => <Link to={`/portal/orders/${p.order_id}`}>{p.order_number}</Link> },
          { title: 'Invoice', render: (p) => p.invoice_id ? <Link to={`/portal/invoices/${p.invoice_id}`}>{p.invoice_number}</Link> : <span className="muted">Advance</span> },
          { title: 'Method', key: 'method' }, { title: 'Reference', key: 'reference' },
          { title: 'Amount', num: true, render: (p) => money(p.amount, p.currency) },
          { title: 'INR realised', num: true, render: (p) => (p.inr_amount ? `₹ ${num(p.inr_amount, 2)}` : '—') },
          ...(isAdmin ? [{ title: '', render: (p) => <button className="linkbtn danger small" onClick={(e) => { e.stopPropagation(); del(p) }}>delete</button> }] : []),
        ]} onRowClick={(p) => navigate(`/portal/orders/${p.order_id}`)} />
      )}
    </>
  )
}
