import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import { PageHead } from '../../components/Layouts'
import { Badge, ErrorBox, Field, fmtDate, Loading, Modal, money, Table, useAction, useApi } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { INCOTERMS } from '../public/Basket'

// ======================================================= Enquiries
export function Enquiries() {
  const { data, error, loading, reload } = useApi('/admin/enquiries')
  const [open, setOpen] = useState(null)
  const act = useAction()
  const setStatus = (e, status) => act.run(async () => { await api(`/admin/enquiries/${e.id}/status`, { method: 'POST', body: { status } }); setOpen(null); reload() })
  return (
    <>
      <PageHead title="Website enquiries" sub="Messages from the contact form on the public site" />
      <ErrorBox error={error || act.error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={setOpen} empty="No enquiries yet." columns={[
          { title: 'Date', render: (e) => fmtDate(e.created_at) },
          { title: 'Name', render: (e) => <><b>{e.full_name}</b><div className="small muted">{e.email}</div></> },
          { title: 'Company', render: (e) => `${e.company} ${e.country ? '· ' + e.country : ''}` },
          { title: 'Interest', key: 'product_interest' },
          { title: 'Status', render: (e) => <Badge status={e.status} /> },
        ]} />
      )}
      {open && (
        <Modal title={`Enquiry from ${open.full_name}`} onClose={() => setOpen(null)}>
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>E-mail</dt><dd><a href={`mailto:${open.email}`}>{open.email}</a></dd>
            <dt>Company</dt><dd>{open.company || '—'}</dd><dt>Country</dt><dd>{open.country || '—'}</dd>
            <dt>Interest</dt><dd>{open.product_interest || '—'}</dd>
          </dl>
          <p style={{ whiteSpace: 'pre-wrap' }}>{open.message || <span className="muted">(no message)</span>}</p>
          <div className="row">{['contacted', 'converted', 'closed'].map((s) => <button key={s} className="btn light sm" onClick={() => setStatus(open, s)}>Mark {s}</button>)}</div>
        </Modal>
      )}
    </>
  )
}

// ======================================================= Customers
const blankCustomer = { company_name: '', country: '', contact_name: '', email: '', phone: '', address: '', tax_id: '', currency: 'USD', default_incoterm: 'FOB', default_port: '', payment_terms: '', is_approved: true }

function CustomerModal({ initial, onClose, onDone }) {
  const [f, setF] = useState(initial ? Object.fromEntries(Object.keys(blankCustomer).map((k) => [k, initial[k] ?? ''])) : blankCustomer)
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = (e) => {
    e.preventDefault()
    run(async () => { initial ? await api(`/admin/customers/${initial.id}`, { method: 'PUT', body: f }) : await api('/admin/customers', { method: 'POST', body: f }); onDone() })
  }
  return (
    <Modal title={initial ? initial.company_name : 'New customer'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Company"><input required value={f.company_name} onChange={set('company_name')} /></Field>
        <Field label="Country"><input required value={f.country} onChange={set('country')} /></Field>
        <Field label="Contact"><input value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="VAT / Tax ID"><input value={f.tax_id} onChange={set('tax_id')} /></Field>
        <Field label="Address" className="span2"><textarea value={f.address} onChange={set('address')} style={{ minHeight: 60 }} /></Field>
        <Field label="Currency"><select value={f.currency} onChange={set('currency')}>{['USD', 'EUR', 'GBP', 'AED', 'INR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Default Incoterm"><select value={f.default_incoterm} onChange={set('default_incoterm')}>{INCOTERMS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Default port"><input value={f.default_port} onChange={set('default_port')} /></Field>
        <Field label="Payment terms"><input value={f.payment_terms} onChange={set('payment_terms')} /></Field>
        <label className="row small span2"><input type="checkbox" checked={f.is_approved} onChange={set('is_approved')} /> Approved to place RFQs</label>
        {error && <div className="alert error span2">{error}</div>}
        <div className="span2 row"><button className="btn" disabled={busy}>Save</button><button type="button" className="btn light" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}

export function Customers() {
  const { data, error, loading, reload } = useApi('/admin/customers')
  const [edit, setEdit] = useState(null)
  return (
    <>
      <PageHead title="Customers"><button className="btn" onClick={() => setEdit('new')}>New customer</button></PageHead>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={setEdit} columns={[
          { title: 'Company', render: (c) => <b>{c.company_name}</b> }, { title: 'Country', key: 'country' },
          { title: 'Contact', render: (c) => <>{c.contact_name}<div className="small muted">{c.email}</div></> },
          { title: 'Terms', render: (c) => `${c.currency} · ${c.default_incoterm} ${c.default_port}` },
          { title: 'Since', render: (c) => fmtDate(c.created_at) },
          { title: '', render: (c) => (c.is_approved ? <Badge status="accepted">approved</Badge> : <Badge status="expired">pending</Badge>) },
        ]} />
      )}
      {edit && <CustomerModal initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </>
  )
}

// ======================================================= Catalogue
export function Catalogue() {
  const { data, error, loading } = useApi('/admin/products')
  const navigate = useNavigate()
  return (
    <>
      <PageHead title="Catalogue" sub="Products, sizes, packing data and list prices"><Link to="/portal/catalogue/new" className="btn">New product</Link></PageHead>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <Table rows={data} onRowClick={(p) => navigate(`/portal/catalogue/${p.id}`)} columns={[
          { title: 'Product', render: (p) => <><b>{p.name}</b><div className="small muted">/{p.slug}</div></> },
          { title: 'Category', render: (p) => p.category.name },
          { title: 'Sizes', render: (p) => p.variants.filter((v) => v.is_active).map((v) => v.size_label).join(', ') },
          { title: 'From', num: true, render: (p) => money(p.price_from) },
          { title: '', render: (p) => (p.is_active ? <Badge status="accepted">live</Badge> : <Badge status="draft">hidden</Badge>) },
        ]} />
      )}
    </>
  )
}

const blankVariant = { sku: '', size_label: '', pcs_per_carton: 500, carton_dims_cm: '', carton_cbm: 0, net_weight_kg: 0, gross_weight_kg: 0, cartons_per_20ft: 0, cartons_per_40hc: 0, moq_cartons: 100, list_price: 0, hs_code: '48236900', is_active: true }
const VCOLS = [['sku', 'SKU', 'text', 90], ['size_label', 'Size', 'text', 130], ['pcs_per_carton', 'Pcs/ctn', 'number', 80], ['carton_dims_cm', 'Carton cm', 'text', 100],
  ['carton_cbm', 'CBM', 'number', 70], ['net_weight_kg', 'Net kg', 'number', 70], ['gross_weight_kg', 'Gross kg', 'number', 70], ['cartons_per_20ft', 'Ctn/20ft', 'number', 80],
  ['cartons_per_40hc', 'Ctn/40HC', 'number', 80], ['moq_cartons', 'MOQ', 'number', 70], ['list_price', 'Price/ctn', 'number', 90], ['hs_code', 'HS code', 'text', 100]]

export function ProductEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { data: cats } = useApi('/public/categories')
  const { data: products } = useApi(isNew ? null : '/admin/products')
  const existing = products?.find((p) => p.id === Number(id))
  const [f, setF] = useState(null)
  const { busy, error, run } = useAction()
  if (!f) {
    if (isNew) setF({ category_id: '', name: '', slug: '', short_description: '', description: '', features: [], image_url: '', is_active: true, sort_order: 0, variants: [{ ...blankVariant }] })
    else if (existing) setF({ ...existing, category_id: existing.category.id, variants: existing.variants.map((v) => ({ ...v })) })
    return <Loading />
  }
  const set = (k, v) => setF({ ...f, [k]: v })
  const setV = (i, k, v) => set('variants', f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const save = (e) => {
    e.preventDefault()
    const body = { ...f, category_id: Number(f.category_id), sort_order: Number(f.sort_order), features: f.features.map((x) => x.trim()).filter(Boolean),
      variants: f.variants.map((v) => Object.fromEntries(Object.entries(v).map(([k, val]) => [k, VCOLS.find((c) => c[0] === k)?.[2] === 'number' ? Number(val) : val]))) }
    run(async () => { await (isNew ? api('/admin/products', { method: 'POST', body }) : api(`/admin/products/${id}`, { method: 'PUT', body })); navigate('/portal/catalogue') })
  }
  return (
    <form onSubmit={save}>
      <PageHead title={isNew ? 'New product' : f.name}>
        <button type="button" className="btn light" onClick={() => navigate('/portal/catalogue')}>Cancel</button>
        <button className="btn" disabled={busy}>Save product</button>
      </PageHead>
      <ErrorBox error={error} />
      <div className="card flat form-grid" style={{ marginBottom: 20 }}>
        <Field label="Name"><input required value={f.name} onChange={(e) => set('name', e.target.value)} onBlur={() => !f.slug && set('slug', f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))} /></Field>
        <Field label="URL slug"><input required value={f.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
        <Field label="Category"><select required value={f.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Select…</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Sort order"><input type="number" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></Field>
        <Field label="Short description (cards)" className="span2"><input value={f.short_description} onChange={(e) => set('short_description', e.target.value)} /></Field>
        <Field label="Full description" className="span2"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Features (one per line)" className="span2"><textarea value={f.features.join('\n')} onChange={(e) => set('features', e.target.value.split('\n'))} /></Field>
        <Field label="Photo URL (leave blank for illustration)" className="span2"><input value={f.image_url} onChange={(e) => set('image_url', e.target.value)} /></Field>
        <label className="row small"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Visible on website</label>
      </div>
      <h3>Sizes / SKUs</h3>
      <div className="table-wrap line-edit">
        <table>
          <thead><tr>{VCOLS.map(([, l]) => <th key={l}>{l}</th>)}<th>Active</th></tr></thead>
          <tbody>{f.variants.map((v, i) => (
            <tr key={i}>
              {VCOLS.map(([k, , t, w]) => <td key={k}><input type={t} step="any" required={k === 'sku' || k === 'size_label'} style={{ width: w }} value={v[k] ?? ''} onChange={(e) => setV(i, k, e.target.value)} /></td>)}
              <td><input type="checkbox" checked={v.is_active} onChange={(e) => setV(i, 'is_active', e.target.checked)} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button type="button" className="btn light sm" style={{ marginTop: 10 }} onClick={() => set('variants', [...f.variants, { ...blankVariant }])}>+ Add size</button>
      <p className="small muted">Sizes are never deleted, because past orders refer to them. Untick "Active" to hide one.</p>
    </form>
  )
}

// ======================================================= Users (admin)
export function Users() {
  const { data, error, reload } = useApi('/admin/users')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ email: '', full_name: '', password: '', role: 'staff' })
  const act = useAction()
  const toggle = (u) => act.run(async () => { await api(`/admin/users/${u.id}/active`, { method: 'POST', params: { active: !u.is_active } }); reload() })
  const add = (e) => { e.preventDefault(); act.run(async () => { await api('/admin/users', { method: 'POST', body: f }); setAdding(false); reload() }) }
  return (
    <>
      <PageHead title="Users"><button className="btn" onClick={() => setAdding(true)}>Add staff user</button></PageHead>
      <ErrorBox error={error || act.error} />
      {!data ? <Loading /> : <Table rows={data} columns={[
        { title: 'Name', render: (u) => <><b>{u.full_name}</b><div className="small muted">{u.email}</div></> },
        { title: 'Role', render: (u) => <Badge status={u.role === 'buyer' ? 'sent' : 'accepted'}>{u.role}</Badge> },
        { title: 'Company', render: (u) => u.customer?.company_name || '—' },
        { title: 'Status', render: (u) => (u.is_active ? 'Active' : <span className="muted">Disabled</span>) },
        { title: '', render: (u) => <button className="linkbtn small" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button> },
      ]} />}
      {adding && (
        <Modal title="Add staff user" onClose={() => setAdding(false)}>
          <form className="form-grid" onSubmit={add}>
            <Field label="Name"><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="E-mail"><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Temporary password"><input minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>staff</option><option>admin</option></select></Field>
            <div className="span2"><button className="btn" disabled={act.busy}>Create user</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

// ======================================================= Buyer profile
export function Profile() {
  const { user, refresh } = useAuth()
  const c = user.customer || {}
  const [f, setF] = useState({ full_name: user.full_name, phone: c.phone || '', address: c.address || '', tax_id: c.tax_id || '', default_port: c.default_port || '' })
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.value }) }
  const submit = (e) => { e.preventDefault(); run(async () => { await api('/auth/me', { method: 'PATCH', body: f }); await refresh(); setSaved(true) }) }
  return (
    <>
      <PageHead title="Company profile" sub={`${c.company_name} · ${c.country}`} />
      <form className="card form-grid" style={{ maxWidth: 720 }} onSubmit={submit}>
        <Field label="Your name"><input value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="VAT / Tax ID"><input value={f.tax_id} onChange={set('tax_id')} /></Field>
        <Field label="Default destination port"><input value={f.default_port} onChange={set('default_port')} /></Field>
        <Field label="Consignee address (printed on invoices)" className="span2"><textarea value={f.address} onChange={set('address')} /></Field>
        <div className="span2 small muted">Currency {c.currency} · Incoterm {c.default_incoterm} · Payment terms: {c.payment_terms || 'to be agreed'}. Contact us to change commercial terms.</div>
        {error && <div className="alert error span2">{error}</div>}
        {saved && <div className="alert ok span2">Profile saved.</div>}
        <div className="span2"><button className="btn" disabled={busy}>Save profile</button></div>
      </form>
    </>
  )
}
