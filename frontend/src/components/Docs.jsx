// Shared pieces for quotation / order / invoice screens.
import { money, num } from './ui'

export function LinesTable({ doc, extraCols = [] }) {
  const cur = doc.currency
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>#</th><th>Description</th><th>HS code</th><th className="num">Pcs/ctn</th><th className="num">Cartons</th>
            {extraCols.map((c) => <th key={c.title} className="num">{c.title}</th>)}
            <th className="num">Rate/ctn</th><th className="num">Amount</th>
          </tr></thead>
          <tbody>
            {doc.items.map((i, n) => (
              <tr key={i.id}>
                <td>{n + 1}</td>
                <td><b>{i.description}</b><div className="small muted mono">{i.sku}</div></td>
                <td className="mono">{i.hs_code}</td>
                <td className="num">{num(i.pcs_per_carton)}</td>
                <td className="num">{num(i.qty_cartons)}</td>
                {extraCols.map((c) => <td key={c.title} className="num">{c.render(i)}</td>)}
                <td className="num">{num(i.unit_price, 2)}</td>
                <td className="num">{num(i.amount, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Totals doc={doc} cur={cur} />
    </>
  )
}

export function Totals({ doc, cur }) {
  return (
    <div className="totals">
      <span>Sub-total</span><span className="right">{money(doc.subtotal, cur)}</span>
      {doc.freight > 0 && <><span>Freight</span><span className="right">{money(doc.freight, cur)}</span></>}
      {doc.insurance > 0 && <><span>Insurance</span><span className="right">{money(doc.insurance, cur)}</span></>}
      {doc.discount > 0 && <><span>Discount</span><span className="right">− {money(doc.discount, cur)}</span></>}
      <span className="grand">Total ({doc.incoterm})</span><span className="grand right">{money(doc.total, cur)}</span>
    </div>
  )
}

export function TermsCard({ doc, children }) {
  return (
    <div className="card flat">
      <dl className="kv">
        <dt>Customer</dt><dd>{doc.customer.company_name} · {doc.customer.country}</dd>
        <dt>Incoterm</dt><dd>{doc.incoterm}</dd>
        <dt>Port of loading</dt><dd>{doc.port_of_loading || '—'}</dd>
        <dt>Port of discharge</dt><dd>{doc.port_of_discharge || '—'}</dd>
        <dt>Payment terms</dt><dd>{doc.payment_terms || '—'}</dd>
        {children}
        {doc.notes && <><dt>Notes</dt><dd>{doc.notes}</dd></>}
      </dl>
    </div>
  )
}
