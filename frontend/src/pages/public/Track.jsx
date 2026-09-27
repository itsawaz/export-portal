import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import Timeline from '../../components/Timeline'
import { Badge, Field, fmtDate, useAction } from '../../components/ui'

export default function Track() {
  const [params] = useSearchParams()
  const [f, setF] = useState({ number: params.get('number') || '', ref: '' })
  const [s, setS] = useState(null)
  const { busy, error, run } = useAction()
  const submit = (e) => {
    e.preventDefault()
    setS(null)
    run(async () => setS(await api('/public/track', { params: f })))
  }
  return (
    <section className="block" style={{ paddingTop: 48 }}>
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="eyebrow">Shipment tracking</div>
        <h1 style={{ fontSize: '2.3rem' }}>Where is my order?</h1>
        <p className="muted">Enter the shipment number from your shipping advice, together with the B/L, AWB or container number.</p>
        <form className="card form-grid" onSubmit={submit} style={{ marginTop: 20 }}>
          <Field label="Shipment number"><input required placeholder="SH/2026-27/0001" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="B/L, AWB or container no."><input required value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          <div className="span2"><button className="btn" disabled={busy}>{busy ? 'Searching…' : 'Track shipment'}</button></div>
          {error && <div className="alert error span2">{error}</div>}
        </form>
        {s && (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="row between"><h3 style={{ margin: 0 }}>{s.number}</h3><Badge status={s.status}>{s.status_label}</Badge></div>
            <dl className="kv" style={{ margin: '16px 0 24px' }}>
              <dt>Route</dt><dd>{s.port_of_loading} → {s.port_of_discharge}</dd>
              <dt>Vessel / voyage</dt><dd>{s.vessel_voyage || '—'}</dd>
              <dt>Container</dt><dd className="mono">{s.container_no || '—'}</dd>
              <dt>B/L / AWB</dt><dd className="mono">{s.bl_awb_no || '—'}</dd>
              <dt>ETD / ETA</dt><dd>{fmtDate(s.etd)} → {fmtDate(s.eta)}</dd>
              {s.tracking_url && <><dt>Carrier tracking</dt><dd><a href={s.tracking_url} target="_blank" rel="noreferrer">Open carrier site ↗</a></dd></>}
            </dl>
            <Timeline shipment={s} />
          </div>
        )}
      </div>
    </section>
  )
}
