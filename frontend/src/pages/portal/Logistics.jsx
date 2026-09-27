import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, openPdf } from '../../api'
import { PageHead } from '../../components/Layouts'
import Timeline from '../../components/Timeline'
import { Badge, ErrorBox, Field, fmtDate, Loading, Modal, num, Table, useAction, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useStatusParam } from './Sales'

export function ShipmentList() {
  const status = useStatusParam()
  const { data, error, loading } = useApi('/shipments', { status })
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <PageHead title="Shipments" />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(s) => navigate(`/portal/shipments/${s.id}`)} empty="No shipments yet." columns={[
          { title: 'Shipment', render: (s) => <><b>{s.number}</b><div className="small muted">{s.order_number}</div></> },
          ...(isStaff ? [{ title: 'Customer', render: (s) => s.customer.company_name }] : []),
          { title: 'Mode', render: (s) => `${s.mode} · ${s.container_type}` },
          { title: 'Container / B/L', render: (s) => <span className="mono">{s.container_no || '—'}<br />{s.bl_awb_no}</span> },
          { title: 'Route', render: (s) => `${s.port_of_loading} → ${s.port_of_discharge}` },
          { title: 'ETA', render: (s) => fmtDate(s.eta) },
          { title: 'Status', render: (s) => <Badge status={s.status}>{s.status_label}</Badge> },
        ]} />
      )}
    </>
  )
}

const EDIT_FIELDS = [
  ['carrier', 'Shipping line / carrier'], ['forwarder', 'Forwarder / CHA'], ['vessel_voyage', 'Vessel / voyage'],
  ['container_no', 'Container no.'], ['seal_no', 'Seal no.'], ['bl_awb_no', 'B/L or AWB no.'], ['shipping_bill_no', 'Shipping bill no.'],
  ['port_of_loading', 'Port of loading'], ['port_of_discharge', 'Port of discharge'], ['etd', 'ETD', 'date'], ['eta', 'ETA', 'date'],
  ['tracking_url', 'Carrier tracking URL'],
]

function EditModal({ s, onClose, onDone }) {
  const [f, setF] = useState(Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, s[k] || ''])))
  const { busy, error, run } = useAction()
  const submit = (e) => {
    e.preventDefault()
    run(async () => onDone(await api(`/shipments/${s.id}`, { method: 'PATCH', body: { ...f, etd: f.etd || null, eta: f.eta || null } })))
  }
  return (
    <Modal title={`Shipment details · ${s.number}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        {EDIT_FIELDS.map(([k, l, t]) => <Field key={k} label={l} className={k === 'tracking_url' ? 'span2' : ''}><input type={t || 'text'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        {error && <div className="alert error span2">{error}</div>}
        <div className="span2 row"><button className="btn" disabled={busy}>Save</button><button type="button" className="btn light" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}

function EventForm({ s, onDone }) {
  const idx = s.stages.findIndex((x) => x.key === s.status)
  const [f, setF] = useState({ status: s.stages[Math.min(idx + 1, s.stages.length - 1)].key, location: '', note: '', event_time: '' })
  const { busy, error, run } = useAction()
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      onDone(await api(`/shipments/${s.id}/events`, { method: 'POST', body: { ...f, event_time: f.event_time ? new Date(f.event_time).toISOString().slice(0, 19) : null } }))
    })
  }
  return (
    <form className="card flat form-grid" onSubmit={submit}>
      <h3 className="span2" style={{ margin: 0 }}>Add milestone</h3>
      <Field label="Stage"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{s.stages.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
      <Field label="When (blank = now)"><input type="datetime-local" value={f.event_time} onChange={(e) => setF({ ...f, event_time: e.target.value })} /></Field>
      <Field label="Location"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {error && <div className="alert error span2">{error}</div>}
      <div className="span2"><button className="btn" disabled={busy}>Add & notify buyer</button></div>
    </form>
  )
}

export function ShipmentDetail() {
  const { id } = useParams()
  const { data: s, error, setData } = useApi(`/shipments/${id}`)
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const act = useAction()
  if (error) return <ErrorBox error={error} />
  if (!s) return <Loading />
  const invoice = () => act.run(async () => { const inv = await api('/invoices/from-shipment', { method: 'POST', body: { shipment_id: s.id } }); navigate(`/portal/invoices/${inv.id}`) })
  const delEvent = (e) => confirm('Remove this milestone?') && act.run(async () => setData(await api(`/shipments/${s.id}/events/${e.id}`, { method: 'DELETE' })))
  const refresh = () => act.run(async () => setData((await api(`/shipments/${s.id}/refresh-tracking`, { method: 'POST' })).shipment))

  return (
    <>
      <PageHead title={s.number} sub={<>Order <Link to={`/portal/orders/${s.order_id}`}>{s.order_number}</Link> · {s.customer.company_name}</>}>
        <Badge status={s.status}>{s.status_label}</Badge>
        {s.invoices.map((i) => <Link key={i.id} className="btn light" to={`/portal/invoices/${i.id}`}>Invoice {i.number}</Link>)}
        {s.invoices[0] && <button className="btn light" onClick={() => openPdf(`/invoices/${s.invoices[0].id}/packing-list.pdf`)}>Packing list</button>}
        {isStaff && <button className="btn light" onClick={() => setEditing(true)}>Edit details</button>}
        {isStaff && s.tracking_provider !== 'manual' && <button className="btn light" disabled={act.busy} onClick={refresh}>Refresh tracking</button>}
        {isStaff && !s.invoices.length && <button className="btn" disabled={act.busy} onClick={invoice}>Raise commercial invoice</button>}
      </PageHead>
      <ErrorBox error={act.error} />
      <div className="grid split">
        <div className="stack">
          <div className="card"><Timeline shipment={s} onDelete={isStaff ? delEvent : null} /></div>
          {isStaff && <EventForm key={s.status + s.events.length} s={s} onDone={setData} />}
        </div>
        <div className="stack">
          <div className="card flat">
            <h3>Details</h3>
            <dl className="kv">
              <dt>Mode</dt><dd>{s.mode} · {s.container_type}</dd>
              <dt>Carrier</dt><dd>{s.carrier || '—'}</dd>
              <dt>Forwarder</dt><dd>{s.forwarder || '—'}</dd>
              <dt>Vessel / voy</dt><dd>{s.vessel_voyage || '—'}</dd>
              <dt>Container</dt><dd className="mono">{s.container_no || '—'}</dd>
              <dt>Seal</dt><dd className="mono">{s.seal_no || '—'}</dd>
              <dt>B/L / AWB</dt><dd className="mono">{s.bl_awb_no || '—'}</dd>
              {isStaff && <><dt>Shipping bill</dt><dd className="mono">{s.shipping_bill_no || '—'}</dd></>}
              <dt>Route</dt><dd>{s.port_of_loading} → {s.port_of_discharge}</dd>
              <dt>ETD</dt><dd>{fmtDate(s.etd)}</dd>
              <dt>ETA</dt><dd>{fmtDate(s.eta)}</dd>
              {s.tracking_url && <><dt>Carrier</dt><dd><a href={s.tracking_url} target="_blank" rel="noreferrer">Track on carrier site ↗</a></dd></>}
            </dl>
            {(s.bl_awb_no || s.container_no) && <p className="small muted" style={{ marginTop: 12 }}>Public tracking link: <Link to={`/track?number=${encodeURIComponent(s.number)}`}>/track</Link> with reference {s.bl_awb_no || s.container_no}</p>}
          </div>
          <Table rows={s.items} columns={[
            { title: 'Goods', render: (i) => <>{i.description}<div className="small muted mono">{i.sku}</div></> },
            { title: 'Cartons', num: true, render: (i) => num(i.qty_cartons) },
          ]} />
        </div>
      </div>
      {editing && <EditModal s={s} onClose={() => setEditing(false)} onDone={(d) => { setData(d); setEditing(false) }} />}
    </>
  )
}
