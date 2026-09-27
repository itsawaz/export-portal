import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useCompany } from '../../components/Layouts'
import ProductArt from '../../components/ProductArt'
import { Field, useAction, useApi } from '../../components/ui'

/* ------ inline SVG icons (tiny, no dependency) ------ */
function Icon({ d }) {
  return (
    <div className="feature-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  )
}

const WHY_ICONS = [
  'M5 19c0-8 6-14 15-14-1 9-7 15-15 14zM6 18c4-5 7-7 11-9',
  'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
  'M3 16h18M5 16V9h6v7M11 12h8l2 4M7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
]

/* ------ enquiry / contact form ------ */
function ContactForm({ categories, inquiryLabel }) {
  const [f, setF] = useState({
    full_name: '', email: '', company: '', country: '',
    product_interest: '', message: '',
  })
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api('/public/enquiries', { method: 'POST', body: f })
      setDone(true)
    })
  }

  if (done) return (
    <div className="card">
      <div className="eyebrow">Message received</div>
      <h3>Thank you — we'll be in touch shortly.</h3>
      <p className="muted">
        Our team replies within one business day. Existing buyers can also
        raise a request for quotation directly from their portal.
      </p>
    </div>
  )

  return (
    <form className="card form-grid" onSubmit={submit}>
      <Field label="Full name"><input required value={f.full_name} onChange={set('full_name')} /></Field>
      <Field label="Work e-mail"><input required type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Company"><input value={f.company} onChange={set('company')} /></Field>
      <Field label="Country"><input value={f.country} onChange={set('country')} /></Field>
      <Field label="Product of interest" className="span2">
        <select value={f.product_interest} onChange={set('product_interest')}>
          <option value="">Select a category</option>
          {categories?.map((c) => <option key={c.id}>{c.name}</option>)}
          <option>Private label / custom</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Message" className="span2">
        <textarea
          maxLength={1000}
          value={f.message}
          onChange={set('message')}
          placeholder="Tell us about your requirements — quantities, destination, any custom specs…"
        />
      </Field>
      {error && <div className="alert error span2">{error}</div>}
      <div className="span2">
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : (inquiryLabel || 'Send enquiry')}</button>
      </div>
    </form>
  )
}

/* ------ main home component ------ */
export default function Home() {
  const company = useCompany()
  const { data: categories } = useApi('/public/categories')

  // Fall back to hardcoded defaults until the API loads
  const whyUs = company.why_us || []
  const process = company.process || []
  const markets = company.markets || []
  const stats = company.stats || []
  const specialtyTags = company.specialty_tags || []

  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="container">
          <div>
            <div className="eyebrow">Est. {company.established} · {company.city}</div>
            <h1>{company.hero_headline || "Compostable tableware, crafted for the world\u2019s best tables."}</h1>
            <p className="hero-lead">
              {company.hero_subtext || company.tagline}
            </p>
            {specialtyTags.length > 0 && (
              <div className="hero-tags">
                {specialtyTags.map((t) => <span key={t} className="hero-tag">{t}</span>)}
              </div>
            )}
            <div className="hero-ctas">
              <Link to="/products" className="btn lg">Explore our range</Link>
              <Link to="/#contact" className="btn lg ghost">{company.inquiry_label || 'Get in touch'}</Link>
            </div>
            {stats.length > 0 && (
              <div className="stats-strip">
                {stats.map(([label, value]) => (
                  <div key={label}>
                    <b>{value}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            {/* fallback stats using live category count */}
            {stats.length === 0 && (
              <div className="stats-strip">
                <div><b>100%</b><span>Plant-fibre, compostable</span></div>
                <div><b>{categories?.reduce((n, c) => n + c.product_count, 0) || '—'}</b><span>Product lines</span></div>
                <div><b>B2B</b><span>Carton & container loads</span></div>
                <div><b>24h</b><span>Quotation turnaround</span></div>
              </div>
            )}
          </div>
          <div className="hero-art">
            <ProductArt category="compartment-plates" size="78%" />
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section className="block" id="products">
        <div className="container">
          <div className="row between section-head" style={{ maxWidth: 'none' }}>
            <div>
              <div className="eyebrow">Our range</div>
              <h2>What we make</h2>
            </div>
            <Link to="/products" className="btn light">View full catalogue →</Link>
          </div>
          <div className="grid g3">
            {categories?.map((c) => (
              <Link key={c.id} to={`/products?category=${c.slug}`} className="product-card">
                <div className="art"><ProductArt category={c.slug} size="58%" /></div>
                <div className="body">
                  <h3>{c.name}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{c.description}</p>
                  <div className="meta">
                    <span>{c.product_count} product{c.product_count !== 1 && 's'}</span>
                    <span className="enquire-hint">Explore →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY US ── */}
      {whyUs.length > 0 && (
        <section className="block alt" id="about">
          <div className="container">
            <div className="section-head">
              <div className="eyebrow">Why work with us</div>
              <h2>Sustainable doesn't mean a compromise</h2>
              <p>Our products hold up in the real world — from airline catering to street food markets.</p>
            </div>
            <div className="grid g3">
              {whyUs.map(([title, body], i) => (
                <div key={title}>
                  <Icon d={WHY_ICONS[i % WHY_ICONS.length]} />
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── ABOUT / STORY ── */}
      {company.about_text && (
        <section className="block" id="story">
          <div className="container">
            <div className="about-grid">
              <div>
                <div className="eyebrow">Our story</div>
                <h2>From waste fibre to world-class tableware</h2>
                <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                  {company.about_text}
                </p>
                <div className="row" style={{ marginTop: 28 }}>
                  <Link to="/#contact" className="btn">{company.inquiry_label || 'Get in touch'}</Link>
                  <Link to="/products" className="btn light">Browse products</Link>
                </div>
              </div>
              <div className="about-visual">
                <ProductArt category="bowls" size="72%" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PROCESS ── */}
      {process.length > 0 && (
        <section className="block alt" id="process">
          <div className="container">
            <div className="section-head center">
              <div className="eyebrow">How we produce</div>
              <h2>From fibre to finished tableware</h2>
            </div>
            <div className="grid g4 steps">
              {process.map(([title, body]) => (
                <div className="step" key={title}>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── MARKETS ── */}
      {markets.length > 0 && (
        <section className="block" id="markets">
          <div className="container">
            <div className="section-head">
              <div className="eyebrow">Export markets</div>
              <h2>Where we ship</h2>
              <p>We supply importers, distributors and food-service operators in over a dozen countries.</p>
            </div>
            <div className="grid g3">
              {markets.map(([code, name, note]) => (
                <div className="market" key={code}>
                  <div className="flag">{code}</div>
                  <div>
                    <b>{name}</b>
                    <div className="muted small">{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── HOW WE WORK (replacing "How to Order") ── */}
      <section className="block alt" id="how-we-work">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">How we work</div>
            <h2>From first message to delivery</h2>
            <p>
              Our process is designed for international buyers — straightforward, transparent,
              and fully tracked online.
            </p>
          </div>
          <div className="flow">
            {['Send an enquiry', 'Receive a quotation', 'Confirm with PO', 'Proforma invoice',
              'Production', 'Shipment tracking', 'Commercial invoice'].map((s, i, arr) => (
              <span key={s}>
                {s}{i < arr.length - 1 && <i> &nbsp;→</i>}
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 32 }}>
            <Link to="/#contact" className="btn">{company.inquiry_label || 'Make an enquiry'}</Link>
            <Link to="/login" className="btn light">Buyer portal login</Link>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="block" id="contact">
        <div className="container contact-grid">
          <div className="contact-info">
            <div className="eyebrow">Get in touch</div>
            <h2>Let's talk about your requirements</h2>
            <p className="muted" style={{ fontSize: '1.05rem' }}>
              Whether you're looking for samples, a custom private-label run, or a
              full container shipment, we're here to help. We reply within one business day.
            </p>
            <dl className="kv">
              <dt>E-mail</dt>
              <dd><a href={`mailto:${company.email}`}>{company.email}</a></dd>
              <dt>Phone</dt>
              <dd><a href={`tel:${company.phone}`}>{company.phone}</a></dd>
              <dt>Office</dt>
              <dd>{company.address}</dd>
            </dl>
          </div>
          <ContactForm categories={categories} inquiryLabel={company.inquiry_label} />
        </div>
      </section>
    </>
  )
}
