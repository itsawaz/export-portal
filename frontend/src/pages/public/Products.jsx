import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ProductArt from '../../components/ProductArt'
import { useCompany } from '../../components/Layouts'
import { ErrorBox, Loading, num, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useBasket } from '../../context/BasketContext'

/* Catalogue grid — portfolio-first */
export function Products() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const [q, setQ] = useState('')
  const { data: cats } = useApi('/public/categories')
  const { data, loading, error } = useApi('/public/products', { category, q })
  const { user } = useAuth()
  const company = useCompany()

  return (
    <section className="block" style={{ paddingTop: 52 }}>
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Product range</div>
          <h1 style={{ fontSize: '2.5rem' }}>Our catalogue</h1>
          <p className="muted" style={{ fontSize: '1.05rem' }}>
            Browse our full range of compostable tableware. Every product ships
            carton-packed and ready for export.{' '}
            {!user && (
              <>
                <Link to="/#contact">Send us an enquiry</Link> or{' '}
                <Link to="/login">sign in</Link> to see indicative pricing.
              </>
            )}
          </p>
        </div>

        <div className="row between" style={{ marginBottom: 28 }}>
          <div className="chips">
            <button className={`chip ${!category ? 'active' : ''}`} onClick={() => setParams({})}>All</button>
            {cats?.map((c) => (
              <button
                key={c.id}
                className={`chip ${category === c.slug ? 'active' : ''}`}
                onClick={() => setParams({ category: c.slug })}
              >
                {c.name}
              </button>
            ))}
          </div>
          <input
            style={{ maxWidth: 260 }}
            placeholder="Search products…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : (
          <div className="grid g3">
            {data?.map((p) => (
              <Link key={p.id} to={`/products/${p.slug}`} className="product-card">
                <div className="art"><ProductArt product={p} size="58%" /></div>
                <div className="body">
                  <span className="eyebrow" style={{ margin: 0 }}>{p.category.name}</span>
                  <h3>{p.name}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{p.short_description}</p>
                  <div className="meta">
                    <span>{p.variants.length} size{p.variants.length !== 1 && 's'}</span>
                    <span className="enquire-hint">
                      View details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            {data?.length === 0 && <p className="muted">No products match.</p>}
          </div>
        )}

        {/* Bottom CTA strip */}
        <div className="card" style={{ marginTop: 56, textAlign: 'center', padding: '36px 24px' }}>
          <div className="eyebrow">Can't find what you need?</div>
          <h3 style={{ margin: '8px 0 12px' }}>We do custom sizes, private label and mixed containers</h3>
          <p className="muted" style={{ marginBottom: 20 }}>
            Reach out and our team will put together a tailored solution for your requirements.
          </p>
          <Link to="/#contact" className="btn">{company.inquiry_label || 'Make an enquiry'}</Link>
        </div>
      </div>
    </section>
  )
}

/* Product detail page — portfolio-first, enquiry-led */
export function ProductDetail() {
  const { slug } = useParams()
  const { data: p, loading, error } = useApi(`/public/products/${slug}`)
  const { add } = useBasket()
  const { user, isStaff } = useAuth()
  const navigate = useNavigate()
  const company = useCompany()
  const [qty, setQty] = useState({})
  const [added, setAdded] = useState(null)

  if (loading) return <div className="container" style={{ padding: 48 }}><Loading /></div>
  if (error) return <div className="container" style={{ padding: 48 }}><ErrorBox error={error} /></div>

  const addToEnquiryList = (v) => {
    const n = Number(qty[v.id] || v.moq_cartons)
    add(p, v, n)
    setAdded(`${v.size_label} added to your enquiry list.`)
  }

  return (
    <section className="block" style={{ paddingTop: 44 }}>
      <div className="container">
        {/* breadcrumb */}
        <p className="small" style={{ marginBottom: 24 }}>
          <Link to="/products">Products</Link>
          {' / '}
          <Link to={`/products?category=${p.category.slug}`}>{p.category.name}</Link>
        </p>

        {/* hero layout */}
        <div className="pd-layout">
          <div className="pd-art"><ProductArt product={p} size="72%" /></div>
          <div>
            <div className="eyebrow">{p.category.name}</div>
            <h1 style={{ fontSize: '2.4rem' }}>{p.name}</h1>
            <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.7 }}>{p.description}</p>
            {p.features?.length > 0 && (
              <ul style={{ color: 'var(--ink)', lineHeight: 1.8 }}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}

            {/* Enquiry CTA box */}
            <div className="enquire-box">
              <p>
                <strong>Interested in this {company.product_noun || 'product'}?</strong>
                {' '}We supply B2B — carton orders and full container loads welcome.
                {!user && <> <Link to="/#contact">Send us an enquiry</Link> or <Link to="/login">sign in</Link> to build a quotation request.</>}
              </p>
              {user && !isStaff && (
                <div className="row">
                  <Link to="/#contact" className="btn ghost sm">{company.inquiry_label || 'Make an enquiry'}</Link>
                  <Link to="/basket" className="btn sm light">View enquiry list →</Link>
                </div>
              )}
              {!user && (
                <div className="row">
                  <Link to="/#contact" className="btn sm">{company.inquiry_label || 'Make an enquiry'}</Link>
                  <Link to="/register" className="btn sm light">Open a buyer account</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Packing & shipping specs */}
        <h2 style={{ marginTop: 56, fontSize: '1.6rem' }}>Sizes & packing specifications</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>
          All carton figures assume floor loading. Custom sizes, printing and private-label
          packing are available on request.
        </p>

        {added && (
          <div className="alert ok row between" style={{ marginBottom: 14 }}>
            {added}
            <button className="btn sm" onClick={() => navigate('/basket')}>View enquiry list →</button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Size</th>
                <th>SKU</th>
                <th className="num">Pcs / carton</th>
                <th>Carton (cm)</th>
                <th className="num">Gross kg</th>
                <th className="num">CBM</th>
                <th className="num">Ctns / 20ft</th>
                <th className="num">Ctns / 40HC</th>
                <th className="num">MOQ</th>
                {user && !isStaff && <th>Add to list</th>}
              </tr>
            </thead>
            <tbody>
              {p.variants.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.size_label}</b></td>
                  <td className="mono">{v.sku}</td>
                  <td className="num">{num(v.pcs_per_carton)}</td>
                  <td>{v.carton_dims_cm}</td>
                  <td className="num">{num(v.gross_weight_kg, 1)}</td>
                  <td className="num">{num(v.carton_cbm, 4)}</td>
                  <td className="num">{num(v.cartons_per_20ft)}</td>
                  <td className="num">{num(v.cartons_per_40hc)}</td>
                  <td className="num">{v.moq_cartons}</td>
                  {user && !isStaff && (
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <input
                          type="number"
                          min={1}
                          style={{ width: 72, padding: '6px 8px', fontSize: '.85rem' }}
                          value={qty[v.id] ?? v.moq_cartons}
                          onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })}
                          aria-label="Cartons"
                        />
                        <button className="btn sm" onClick={() => addToEnquiryList(v)}>Add</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.variants[0]?.hs_code && (
          <p className="muted small" style={{ marginTop: 12 }}>
            HS code: {p.variants[0].hs_code}. Prices are indicative and confirmed on your formal quotation.
          </p>
        )}
      </div>
    </section>
  )
}
