import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, openPdf } from '../../api'
import { LinesTable, TermsCard } from '../../components/Docs'
import { PageHead } from '../../components/Layouts'
import { Badge, ErrorBox, Field, fmtDate, Loading, Modal, money, num, Table, useAction, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { INCOTERMS } from '../public/Basket'

function StatusFilter({ options }) {
  const [p, setP] = useSearchParams()
  const cur = p.get('status') || ''
  return (
    <div className="chips" style={{ marginBottom: 16 }}>
      <button className={`chip ${!cur ? 'active' : ''}`} onClick={() => setP({})}>All</button>
      {options.map((o) => <button key={o} className={`chip ${cur === o ? 'active' : ''}`} onClick={() => setP({ status: o })}>{o.replaceAll('_', ' ')}</button>)}
    </div>
  )
}
export const useStatusParam = () => useSearchParams()[0].get('status') || ''
export const Flash = () => { const m = useLocation().state?.flash; return m ? <div className="alert ok" style={{ marginBottom: 16 }}>{m}</div> : null }

// ======================================================= RFQs
export function RfqList() {
  const status = useStatusParam()
  const { data, error, loading } = useApi('/rfqs', { status })
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <PageHead title={isStaff ? 'Requests for quotation' : 'My RFQs'}>{!isStaff && <Link to="/products" className="btn">New request</Link>}</PageHead>
      <StatusFilter options={['submitted', 'quoted', 'cancelled']} />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(r) => navigate(`/portal/rfqs/${r.id}`)} empty="No RFQs yet. Add products to the quote basket to create one." columns={[
          { title: 'RFQ', render: (r) => <b>{r.number}</b> },
          ...(isStaff ? [{ title: 'Customer', render: (r) => `${r.customer.company_name} · ${r.customer.country}` }] : []),
          { title: 'Date', render: (r) => fmtDate(r.created_at) },
          { title: 'Lines', render: (r) => r.items.length },
          { title: 'Cartons', num: true, render: (r) => num(r.items.reduce((s, i) => s + i.qty_cartons, 0)) },
          { title: 'Terms', render: (r) => `${r.incoterm} ${r.destination_port}` },
          { title: 'Status', render: (r) => <Badge status={r.status} /> },
        ]} />
      )}
    </>
  )
}

export function RfqDetail() {
  const { id } = useParams()
  const { data: r, error, reload } = useApi(`/rfqs/${id}`)
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const act = useAction()
  if (error) return <ErrorBox error={error} />
  if (!r) return <Loading />
  const makeQuote = () => act.run(async () => { const q = await api(`/rfqs/${r.id}/quotation`, { method: 'POST' }); navigate(`/portal/quotes/${q.id}`) })
  const cancel = () => act.run(async () => { await api(`/rfqs/${r.id}/cancel`, { method: 'POST' }); reload() })
  return (
    <>
      <Flash />
      <PageHead title={r.number} sub={`${r.customer.company_name} · submitted ${fmtDate(r.created_at)}`}>
        <Badge status={r.status} />
        {isStaff && r.status !== 'cancelled' && <button className="btn" disabled={act.busy} onClick={makeQuote}>{r.quotations.length ? 'Create another quotation' : 'Create quotation'}</button>}
        {r.status === 'submitted' && <button className="btn light" disabled={act.busy} onClick={cancel}>Cancel RFQ</button>}
      </PageHead>
      <ErrorBox error={act.error} />
      <div className="grid split">
        <Table rows={r.items} columns={[
          { title: 'Product', render: (i) => <><b>{i.product_name}</b><div className="small muted">{i.size_label} · <span className="mono">{i.sku}</span></div></> },
          { title: 'Pcs/ctn', num: true, render: (i) => num(i.pcs_per_carton) },
          { title: 'Cartons', num: true, render: (i) => num(i.qty_cartons) },
          { title: 'List price', num: true, render: (i) => money(i.list_price) },
          { title: 'Est. value', num: true, render: (i) => money(i.list_price * i.qty_cartons) },
        ]} />
        <div className="card flat">
          <dl className="kv">
            <dt>Incoterm</dt><dd>{r.incoterm}</dd>
            <dt>Destination</dt><dd>{r.destination_port || '—'}</dd>
            <dt>Needed by</dt><dd>{fmtDate(r.target_date)}</dd>
            <dt>Private label</dt><dd>{r.private_label ? 'Yes' : 'No'}</dd>
            {r.notes && <><dt>Notes</dt><dd>{r.notes}</dd></>}
            <dt>Quotations</dt><dd>{r.quotations.length ? r.quotations.map((q) => <div key={q.id}><Link to={`/portal/quotes/${q.id}`}>{q.number}</Link> <Badge status={q.status} /></div>) : 'Awaiting quotation'}</dd>
          </dl>
        </div>
      </div>
    </>
  )
}

// ======================================================= Quotations
export function QuoteList() {
  const status = useStatusParam()
  const { data, error, loading } = useApi('/quotations', { status })
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <PageHead title="Quotations">{isStaff && <Link to="/portal/quotes/new" className="btn">New quotation</Link>}</PageHead>
      <StatusFilter options={isStaff ? ['draft', 'sent', 'accepted', 'rejected', 'expired'] : ['sent', 'accepted', 'rejected', 'expired']} />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(q) => navigate(`/portal/quotes/${q.id}`)} empty="No quotations." columns={[
          { title: 'Quotation', render: (q) => <b>{q.number}</b> },
          ...(isStaff ? [{ title: 'Customer', render: (q) => q.customer.company_name }] : []),
          { title: 'RFQ', render: (q) => q.rfq_number || '—' },
          { title: 'Date', render: (q) => fmtDate(q.quote_date) },
          { title: 'Valid until', render: (q) => fmtDate(q.valid_until) },
          { title: 'Total', num: true, render: (q) => money(q.total, q.currency) },
          { title: 'Status', render: (q) => <Badge status={q.status} /> },
        ]} />
      )}
    </>
  )
}

function DecisionModal({ q, accept, onClose, onDone }) {
  const [f, setF] = useState({ buyer_po: '', response: '' })
  const { busy, error, run } = useAction()
  const submit = (e) => {
    e.preventDefault()
    run(async () => onDone(await api(`/quotations/${q.id}/decision`, { method: 'POST', body: { accept, ...f } })))
  }
  return (
    <Modal title={accept ? 'Accept quotation & confirm order' : 'Decline quotation'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {accept && <p className="muted">Accepting confirms a sales order for <b>{money(q.total, q.currency)}</b> ({q.incoterm}). A proforma invoice for your advance payment is issued straight away.</p>}
        {accept && <Field label="Your purchase order number"><input value={f.buyer_po} onChange={(e) => setF({ ...f, buyer_po: e.target.value })} /></Field>}
        <Field label={accept ? 'Comments (optional)' : 'Reason (helps us revise the offer)'}><textarea value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className={`btn ${accept ? '' : 'danger'}`} disabled={busy}>{accept ? 'Confirm order' : 'Decline'}</button><button type="button" className="btn light" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}

export function QuoteDetail() {
  const { id } = useParams()
  const { data: q, error, reload } = useApi(`/quotations/${id}`)
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [decision, setDecision] = useState(null)
  const act = useAction()
  if (error) return <ErrorBox error={error} />
  if (!q) return <Loading />
  if (editing) return <QuoteEditor initial={q} onSaved={() => { setEditing(false); reload() }} onCancel={() => setEditing(false)} />
  const send = () => act.run(async () => { await api(`/quotations/${q.id}/send`, { method: 'POST' }); reload() })

  return (
    <>
      <PageHead title={q.number} sub={`${q.customer.company_name} · ${q.rfq_number ? `for ${q.rfq_number} · ` : ''}valid until ${fmtDate(q.valid_until)}`}>
        <Badge status={q.status} />
        <button className="btn light" onClick={() => openPdf(`/quotations/${q.id}/pdf`)}>PDF</button>
        {isStaff && ['draft', 'sent'].includes(q.status) && <button className="btn light" onClick={() => setEditing(true)}>Edit</button>}
        {isStaff && ['draft', 'expired'].includes(q.status) && <button className="btn" disabled={act.busy} onClick={send}>Send to buyer</button>}
        {!isStaff && q.status === 'sent' && <>
          <button className="btn light" onClick={() => setDecision('reject')}>Decline</button>
          <button className="btn" onClick={() => setDecision('accept')}>Accept & place order</button>
        </>}
      </PageHead>
      <ErrorBox error={act.error} />
      {q.status === 'draft' && isStaff && <div className="alert warn" style={{ marginBottom: 16 }}>Draft: the buyer cannot see this quotation until you send it.</div>}
      {q.buyer_response && <div className="alert ok" style={{ marginBottom: 16 }}>Buyer comment: {q.buyer_response}</div>}
      <div className="grid split">
        <div><LinesTable doc={q} /></div>
        <TermsCard doc={q}><dt>Quotation date</dt><dd>{fmtDate(q.quote_date)}</dd></TermsCard>
      </div>
      {decision && <DecisionModal q={q} accept={decision === 'accept'} onClose={() => setDecision(null)}
        onDone={(r) => r.order ? navigate(`/portal/orders/${r.order.id}`, { state: { flash: `Order ${r.order.number} confirmed. Proforma invoice ${r.order.pi_number} is ready to download.` } }) : (setDecision(null), reload())} />}
    </>
  )
}

// ---------- editor (staff) used for new and existing quotations
const blankLine = { variant_id: null, description: '', sku: '', hs_code: '', pcs_per_carton: 0, qty_cartons: 100, unit_price: 0 }

export function QuoteEditor({ initial, onSaved, onCancel }) {
  const navigate = useNavigate()
  const { data: customers } = useApi('/admin/customers')
  const { data: variants } = useApi('/admin/variants')
  const [q, setQ] = useState(() => initial ? {
    customer_id: initial.customer.id, rfq_id: initial.rfq_id, valid_until: initial.valid_until || '',
    ...Object.fromEntries(['currency', 'incoterm', 'port_of_loading', 'port_of_discharge', 'payment_terms', 'freight', 'insurance', 'discount', 'notes'].map((k) => [k, initial[k]])),
    items: initial.items.map(({ id: _, amount: __, ...rest }) => rest),
  } : { customer_id: '', currency: 'USD', incoterm: 'FOB', port_of_loading: 'Nhava Sheva (INNSA)', port_of_discharge: '', payment_terms: '30% advance by T/T, 70% against copy of B/L', freight: 0, insurance: 0, discount: 0, notes: '', valid_until: '', items: [{ ...blankLine }] })
  const { busy, error, run } = useAction()
  const set = (k, v) => setQ((cur) => ({ ...cur, [k]: v }))
  const setLine = (i, patch) => setQ((cur) => ({ ...cur, items: cur.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const pickVariant = (i, vid) => {
    const v = variants.find((x) => x.id === Number(vid))
    if (v) setLine(i, { variant_id: v.id, description: `${v.product_name} — ${v.size_label}`, sku: v.sku, hs_code: v.hs_code, pcs_per_carton: v.pcs_per_carton, unit_price: v.list_price })
  }
  const pickCustomer = (cid) => {
    const c = customers.find((x) => x.id === Number(cid))
    setQ((cur) => ({ ...cur, customer_id: Number(cid), ...(c && !initial ? { currency: c.currency, incoterm: c.default_incoterm, port_of_discharge: c.default_port, payment_terms: c.payment_terms || cur.payment_terms } : {}) }))
  }
  const subtotal = q.items.reduce((s, l) => s + Number(l.qty_cartons || 0) * Number(l.unit_price || 0), 0)
  const total = subtotal + Number(q.freight || 0) + Number(q.insurance || 0) - Number(q.discount || 0)

  const save = (e) => {
    e.preventDefault()
    const body = { ...q, valid_until: q.valid_until || null, freight: Number(q.freight), insurance: Number(q.insurance), discount: Number(q.discount),
      items: q.items.map((l) => ({ ...l, qty_cartons: Number(l.qty_cartons), unit_price: Number(l.unit_price), pcs_per_carton: Number(l.pcs_per_carton) })) }
    run(async () => {
      const saved = initial ? await api(`/quotations/${initial.id}`, { method: 'PUT', body }) : await api('/quotations', { method: 'POST', body })
      onSaved ? onSaved(saved) : navigate(`/portal/quotes/${saved.id}`)
    })
  }

  return (
    <form onSubmit={save}>
      <PageHead title={initial ? `Edit ${initial.number}` : 'New quotation'}>
        <button type="button" className="btn light" onClick={onCancel || (() => navigate(-1))}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save quotation'}</button>
      </PageHead>
      <ErrorBox error={error} />
      <div className="card flat form-grid" style={{ marginBottom: 20 }}>
        <Field label="Customer">
          <select required value={q.customer_id} disabled={!!initial} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">Select customer…</option>
            {customers?.map((c) => <option key={c.id} value={c.id}>{c.company_name} ({c.country})</option>)}
          </select>
        </Field>
        <Field label="Currency"><select value={q.currency} onChange={(e) => set('currency', e.target.value)}>{['USD', 'EUR', 'GBP', 'AED', 'INR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Incoterm"><select value={q.incoterm} onChange={(e) => set('incoterm', e.target.value)}>{INCOTERMS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Valid until"><input type="date" value={q.valid_until || ''} onChange={(e) => set('valid_until', e.target.value)} /></Field>
        <Field label="Port of loading"><input value={q.port_of_loading} onChange={(e) => set('port_of_loading', e.target.value)} /></Field>
        <Field label="Port of discharge"><input value={q.port_of_discharge} onChange={(e) => set('port_of_discharge', e.target.value)} /></Field>
        <Field label="Payment terms" className="span2"><input value={q.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} /></Field>
      </div>

      <div className="table-wrap line-edit">
        <table>
          <thead><tr><th style={{ minWidth: 220 }}>Product / SKU</th><th>Description</th><th className="num">Pcs/ctn</th><th className="num">Cartons</th><th className="num">Rate/ctn</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {q.items.map((l, i) => (
              <tr key={i}>
                <td><select value={l.variant_id || ''} onChange={(e) => pickVariant(i, e.target.value)}>
                  <option value="">Custom line…</option>
                  {variants?.map((v) => <option key={v.id} value={v.id}>{v.sku} — {v.product_name} {v.size_label}</option>)}
                </select></td>
                <td><input required value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td><input type="number" style={{ width: 80 }} value={l.pcs_per_carton} onChange={(e) => setLine(i, { pcs_per_carton: e.target.value })} /></td>
                <td><input type="number" min={1} required style={{ width: 90 }} value={l.qty_cartons} onChange={(e) => setLine(i, { qty_cartons: e.target.value })} /></td>
                <td><input type="number" min={0} step="0.01" required style={{ width: 100 }} value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                <td className="num">{num(Number(l.qty_cartons) * Number(l.unit_price), 2)}</td>
                <td><button type="button" className="linkbtn danger" disabled={q.items.length === 1} onClick={() => set('items', q.items.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn light sm" style={{ marginTop: 10 }} onClick={() => set('items', [...q.items, { ...blankLine }])}>+ Add line</button>

      <div className="grid g2" style={{ marginTop: 20, alignItems: 'start' }}>
        <Field label="Notes shown on quotation"><textarea value={q.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="totals" style={{ marginTop: 0 }}>
          <span>Sub-total</span><span className="right">{money(subtotal, q.currency)}</span>
          <span>Freight</span><input type="number" step="0.01" value={q.freight} onChange={(e) => set('freight', e.target.value)} style={{ width: 120 }} />
          <span>Insurance</span><input type="number" step="0.01" value={q.insurance} onChange={(e) => set('insurance', e.target.value)} style={{ width: 120 }} />
          <span>Discount</span><input type="number" step="0.01" value={q.discount} onChange={(e) => set('discount', e.target.value)} style={{ width: 120 }} />
          <span className="grand">Total ({q.incoterm})</span><span className="grand right">{money(total, q.currency)}</span>
        </div>
      </div>
    </form>
  )
}
