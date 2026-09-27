import { Link, useNavigate } from 'react-router-dom'
import { PageHead } from '../../components/Layouts'
import { Badge, ErrorBox, fmtDate, label, Loading, money, Table, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

function Kpi({ title, value, to, alert }) {
  const body = <div className={`kpi ${alert ? 'alert-kpi' : ''}`}><span>{title}</span><b>{value}</b></div>
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body
}

function StaffDashboard() {
  const { data: d, error } = useApi('/admin/dashboard')
  const navigate = useNavigate()
  if (error) return <ErrorBox error={error} />
  if (!d) return <Loading />
  return (
    <>
      <PageHead title="Dashboard" sub="Sales pipeline, logistics and receivables at a glance">
        <Link to="/portal/quotes/new" className="btn">New quotation</Link>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Kpi title="New enquiries" value={d.new_enquiries} to="/portal/enquiries" />
        <Kpi title="RFQs to quote" value={d.open_rfqs} to="/portal/rfqs?status=submitted" />
        <Kpi title="Quotes awaiting buyer" value={d.quotes_awaiting_buyer} to="/portal/quotes?status=sent" />
        <Kpi title="Open orders" value={d.orders_open} to="/portal/orders" />
        <Kpi title="Shipments in transit" value={d.shipments_in_transit} to="/portal/shipments" />
        <Kpi title="Receivable" value={money(d.receivable)} to="/portal/invoices" />
        <Kpi title="Overdue" value={`${d.overdue_count} · ${money(d.overdue_amount)}`} to="/portal/invoices" alert={d.overdue_count > 0} />
        <Kpi title="Orders this FY" value={money(d.order_value_fy)} />
      </div>
      <div className="grid g2">
        <div>
          <h3>Recent orders</h3>
          <Table rows={d.recent_orders} onRowClick={(o) => navigate(`/portal/orders/${o.id}`)} columns={[
            { title: 'Order', render: (o) => <b>{o.number}</b> },
            { title: 'Customer', render: (o) => o.customer.company_name },
            { title: 'Status', render: (o) => <Badge status={o.status} /> },
            { title: 'Total', num: true, render: (o) => money(o.total, o.currency) },
          ]} />
        </div>
        <div>
          <h3>Upcoming arrivals</h3>
          <Table rows={d.upcoming_arrivals} empty="Nothing on the water." onRowClick={(s) => navigate(`/portal/shipments/${s.id}`)} columns={[
            { title: 'Shipment', render: (s) => <b>{s.number}</b> },
            { title: 'Customer', render: (s) => s.customer.company_name },
            { title: 'To', key: 'port_of_discharge' },
            { title: 'ETA', render: (s) => fmtDate(s.eta) },
          ]} />
          {d.overdue_invoices.length > 0 && <>
            <h3 style={{ marginTop: 24 }}>Overdue invoices</h3>
            <Table rows={d.overdue_invoices} onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)} columns={[
              { title: 'Invoice', key: 'number' }, { title: 'Customer', render: (i) => i.customer.company_name },
              { title: 'Due', render: (i) => fmtDate(i.due_date) }, { title: 'Balance', num: true, render: (i) => money(i.balance, i.currency) },
            ]} />
          </>}
        </div>
      </div>
      <h3 style={{ marginTop: 24 }}>Orders by status</h3>
      <div className="row">{Object.entries(d.orders_by_status).map(([k, v]) => <Badge key={k} status={k}>{label(k)}: {v}</Badge>)}</div>
    </>
  )
}

function BuyerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const quotes = useApi('/quotations', { status: 'sent' })
  const orders = useApi('/orders')
  const invoices = useApi('/invoices')
  const open = orders.data?.filter((o) => !['closed', 'cancelled'].includes(o.status)) || []
  const due = invoices.data?.filter((i) => ['issued', 'partially_paid'].includes(i.status)) || []
  return (
    <>
      <PageHead title={`Welcome, ${user.full_name?.split(' ')[0] || ''}`} sub={user.customer?.company_name}>
        <Link to="/products" className="btn">Browse & request quote</Link>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Kpi title="Quotations to review" value={quotes.data?.length ?? '—'} to="/portal/quotes" />
        <Kpi title="Open orders" value={open.length} to="/portal/orders" />
        <Kpi title="Invoices due" value={due.length} to="/portal/invoices" />
        <Kpi title="Balance due" value={money(due.reduce((s, i) => s + i.balance, 0))} to="/portal/invoices" />
      </div>
      {quotes.data?.length > 0 && <>
        <h3>Quotations waiting for your decision</h3>
        <Table rows={quotes.data} onRowClick={(q) => navigate(`/portal/quotes/${q.id}`)} columns={[
          { title: 'Quotation', render: (q) => <b>{q.number}</b> }, { title: 'Valid until', render: (q) => fmtDate(q.valid_until) },
          { title: 'Total', num: true, render: (q) => money(q.total, q.currency) },
        ]} />
      </>}
      <h3 style={{ marginTop: 24 }}>Your orders</h3>
      <Table rows={open} empty="No open orders." onRowClick={(o) => navigate(`/portal/orders/${o.id}`)} columns={[
        { title: 'Order', render: (o) => <b>{o.number}</b> }, { title: 'Your PO', key: 'buyer_po' },
        { title: 'Status', render: (o) => <Badge status={o.status} /> },
        { title: 'Shipped', render: (o) => `${o.shipped_cartons}/${o.ordered_cartons} ctn` },
        { title: 'Total', num: true, render: (o) => money(o.total, o.currency) },
      ]} />
    </>
  )
}

export default function Dashboard() {
  const { isStaff } = useAuth()
  return isStaff ? <StaffDashboard /> : <BuyerDashboard />
}
