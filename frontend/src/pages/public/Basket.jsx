import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import ProductArt from '../../components/ProductArt'
import { useCompany } from '../../components/Layouts'
import { Field, num, useAction } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { containerFill, useBasket } from '../../context/BasketContext'

export const INCOTERMS = ['EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP']

export default function Basket() {
  const { items, update, remove, clear, totals } = useBasket()
  const { user, isStaff } = useAuth()
  const navigate = useNavigate()
  const company = useCompany()
  const [f, setF] = useState({
    incoterm: user?.customer?.default_incoterm || 'FOB',
    destination_port: user?.customer?.default_port || '',
    target_date: '',
    private_label: false,
    notes: '',
  })
  const { busy, error, run } = useAction()
  const fill = containerFill(totals.cbm)

  const submit = (e) => {
    e.preventDefault()
    if (!user) return navigate('/login?next=/basket')
    run(async () => {
      const r = await api('/rfqs', {
        method: 'POST',
        body: {
          ...f,
          target_date: f.target_date || null,
          items: items.map(({ variant_id, qty_cartons }) => ({ variant_id, qty_cartons })),
        },
      })
      clear()
      navigate(`/portal/rfqs/${r.id}`, {
        state: { flash: `Request ${r.number} submitted. We'll send your quotation shortly.` },
      })
    })
  }

  if (!items.length) return (
    <section className="block">
      <div className="container empty">
        <h2>Your enquiry list is empty</h2>
        <p className="muted">
          Browse our range, pick the products you're interested in, and send us
          one request — we'll come back with pricing and availability.
        </p>
        <Link to="/products" className="btn" style={{ marginTop: 16 }}>Browse our range</Link>
      </div>
    </section>
  )

  return (
    <section className="block" style={{ paddingTop: 48 }}>
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Enquiry list</div>
          <h1 style={{ fontSize: '2.3rem' }}>Your product shortlist</h1>
          <p className="muted">
            Mix any products and sizes into one request. We'll reply with a formal
            quotation including freight for your chosen Incoterm.
          </p>
        </div>
        <div className="grid split">
          {/* product list */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Pcs/ctn</th>
                  <th>Cartons</th>
                  <th className="num">Est. CBM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.variant_id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <div style={{ width: 52, flex: 'none' }}>
                          <ProductArt category={x.category} size="100%" />
                        </div>
                        <div>
                          <Link to={`/products/${x.product_slug}`}><b>{x.product_name}</b></Link>
                          <div className="small muted">
                            {x.size_label} · <span className="mono">{x.sku}</span>
                          </div>
                          {x.qty_cartons < x.moq_cartons && (
                            <div className="small" style={{ color: 'var(--warn)' }}>
                              Below MOQ of {x.moq_cartons} cartons
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">{num(x.pcs_per_carton)}</td>
                    <td>
                      <div className="qty">
                        <button type="button" onClick={() => update(x.variant_id, x.qty_cartons - 10)} aria-label="Decrease">−</button>
                        <input
                          type="number" min={1} value={x.qty_cartons}
                          onChange={(e) => update(x.variant_id, Number(e.target.value))}
                          aria-label="Cartons"
                        />
                        <button type="button" onClick={() => update(x.variant_id, x.qty_cartons + 10)} aria-label="Increase">+</button>
                      </div>
                    </td>
                    <td className="num">{num(x.carton_cbm * x.qty_cartons, 2)} m³</td>
                    <td><button className="linkbtn danger" onClick={() => remove(x.variant_id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* sidebar */}
          <div className="stack">
            {/* load summary */}
            <div className="card">
              <h3>Load estimate</h3>
              <dl className="kv">
                <dt>Cartons</dt><dd>{num(totals.cartons)}</dd>
                <dt>Volume</dt><dd>{num(totals.cbm, 2)} m³</dd>
                <dt>Gross weight</dt><dd>{num(totals.kg)} kg</dd>
              </dl>
              <div style={{ marginTop: 14 }}>
                <div className="small muted" style={{ marginBottom: 4 }}>20ft container fill · {num(fill.twenty)}%</div>
                <div className="meter"><div style={{ width: `${fill.twenty}%` }} /></div>
                <div className="small muted" style={{ marginTop: 8, marginBottom: 4 }}>40ft HC container fill · {num(fill.fortyHc)}%</div>
                <div className="meter"><div style={{ width: `${fill.fortyHc}%` }} /></div>
              </div>
            </div>

            {/* RFQ form */}
            {isStaff ? (
              <div className="alert warn">
                You're signed in as staff. Buyers submit RFQ requests from here;
                staff create quotations in the portal.
              </div>
            ) : (
              <form className="card form-grid" onSubmit={submit}>
                <h3 className="span2" style={{ margin: 0 }}>Send request for quotation</h3>
                <p className="span2 muted small" style={{ margin: 0 }}>
                  We'll follow up within one business day with a formal quotation.
                </p>
                <Field label="Incoterm">
                  <select value={f.incoterm} onChange={(e) => setF({ ...f, incoterm: e.target.value })}>
                    {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Required by">
                  <input type="date" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} />
                </Field>
                <Field label="Destination port" className="span2">
                  <input
                    value={f.destination_port}
                    onChange={(e) => setF({ ...f, destination_port: e.target.value })}
                    placeholder="e.g. Jebel Ali, Felixstowe, Hamburg"
                  />
                </Field>
                <label className="span2 row small">
                  <input
                    type="checkbox"
                    checked={f.private_label}
                    onChange={(e) => setF({ ...f, private_label: e.target.checked })}
                  />
                  Private label / custom printing required
                </label>
                <Field label="Notes" className="span2">
                  <textarea
                    value={f.notes}
                    onChange={(e) => setF({ ...f, notes: e.target.value })}
                    placeholder="Target price, packing requirements, labelling specs…"
                  />
                </Field>
                {error && <div className="alert error span2">{error}</div>}
                <button className="btn span2" disabled={busy}>
                  {user ? (busy ? 'Submitting…' : 'Submit request for quotation') : 'Sign in to submit'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
