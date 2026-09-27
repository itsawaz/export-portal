"""PDF documents: Quotation, Proforma Invoice, Commercial Invoice, Packing List.

Built with ReportLab so there is no browser / wkhtmltopdf dependency.
"""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..config import settings as S
from ..models import Customer, Invoice, Quotation, SalesOrder

GREEN = colors.HexColor("#2f5d3a")
LIGHT = colors.HexColor("#eef3ec")

ss = getSampleStyleSheet()
small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, leading=10)
normal = ParagraphStyle("norm", parent=ss["Normal"], fontSize=9, leading=11.5)
bold = ParagraphStyle("bold", parent=normal, fontName="Helvetica-Bold")
title_style = ParagraphStyle("title", parent=ss["Title"], fontSize=15, textColor=GREEN, spaceAfter=2)
right = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)


def _money(v: float, cur: str) -> str:
    return f"{cur} {v:,.2f}"


def _p(text, style=normal):
    return Paragraph(str(text or "").replace("\n", "<br/>"), style)


def _header(doc_title: str) -> list:
    left = [_p(f"<b>{S.company_name}</b>", ParagraphStyle("c", parent=normal, fontSize=12, textColor=GREEN)),
            _p(S.company_address, small),
            _p(f"{S.company_email} · {S.company_phone}", small),
            _p(f"GSTIN: {S.company_gstin} · IEC: {S.company_iec}", small)]
    t = Table([[left, _p(doc_title, title_style)]], colWidths=[110 * mm, 70 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                           ("LINEBELOW", (0, 0), (-1, 0), 1.2, GREEN), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return [t, Spacer(1, 5 * mm)]


def _party_and_meta(c: Customer, meta: list[tuple[str, str]]) -> list:
    buyer = [_p("<b>Buyer / Consignee</b>", small), _p(f"<b>{c.company_name}</b>"),
             _p(c.address or "", small), _p(c.country, small)]
    if c.tax_id:
        buyer.append(_p(f"Tax ID: {c.tax_id}", small))
    if c.contact_name or c.email:
        buyer.append(_p(f"Attn: {c.contact_name} {c.email}", small))
    meta_rows = [[_p(k, small), _p(f"<b>{v}</b>", small)] for k, v in meta if v]
    mt = Table(meta_rows, colWidths=[30 * mm, 50 * mm])
    mt.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    t = Table([[buyer, mt]], colWidths=[100 * mm, 80 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (0, 0), 0.5, colors.grey),
                           ("LEFTPADDING", (0, 0), (0, 0), 6), ("TOPPADDING", (0, 0), (0, 0), 5)]))
    return [t, Spacer(1, 5 * mm)]


def _grid_style(n_rows: int) -> TableStyle:
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b8c4b5")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        *[("BACKGROUND", (0, r), (-1, r), LIGHT) for r in range(2, n_rows, 2)],
    ])


def _lines_table(doc) -> list:
    cur = doc.currency
    rows = [["#", "Description", "HS Code", "Pcs/Ctn", "Cartons", "Total Pcs", f"Rate/Ctn", "Amount"]]
    for n, i in enumerate(doc.items, 1):
        rows.append([n, _p(f"{i.description}<br/><font size=7 color='#666'>{i.sku}</font>", small), i.hs_code,
                     f"{i.pcs_per_carton:,}", f"{i.qty_cartons:,}", f"{i.pcs_per_carton * i.qty_cartons:,}",
                     f"{i.unit_price:,.2f}", f"{i.amount:,.2f}"])
    t = Table(rows, colWidths=[7 * mm, 60 * mm, 18 * mm, 15 * mm, 16 * mm, 20 * mm, 20 * mm, 24 * mm], repeatRows=1)
    t.setStyle(_grid_style(len(rows)))

    tot = [["Sub-total", _money(doc.subtotal, cur)]]
    if doc.freight:
        tot.append(["Freight", _money(doc.freight, cur)])
    if doc.insurance:
        tot.append(["Insurance", _money(doc.insurance, cur)])
    if doc.discount:
        tot.append(["Discount", "- " + _money(doc.discount, cur)])
    tot.append([f"TOTAL ({doc.incoterm})", _money(doc.total, cur)])
    tt = Table(tot, colWidths=[40 * mm, 35 * mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 9),
                            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                            ("LINEABOVE", (0, -1), (-1, -1), 1, GREEN)]))
    total_cartons = sum(i.qty_cartons for i in doc.items)
    return [t, Spacer(1, 2 * mm),
            _p(f"Total cartons: <b>{total_cartons:,}</b>", small), tt, Spacer(1, 5 * mm)]


def _terms(doc, extra: list[str] | None = None) -> list:
    rows = [f"<b>Incoterm:</b> {doc.incoterm} {doc.port_of_loading if doc.incoterm in ('FOB', 'FCA', 'EXW') else doc.port_of_discharge}",
            f"<b>Port of loading:</b> {doc.port_of_loading}  &nbsp; <b>Port of discharge:</b> {doc.port_of_discharge}",
            f"<b>Payment terms:</b> {doc.payment_terms}"]
    rows += extra or []
    if doc.notes:
        rows.append(f"<b>Notes:</b> {doc.notes}")
    return [_p(r) for r in rows] + [Spacer(1, 4 * mm)]


def _bank() -> list:
    return [_p("<b>Bank details for T/T remittance</b>", small),
            _p(f"Beneficiary: {S.company_name} · Bank: {S.company_bank_name}, {S.company_bank_branch}<br/>"
               f"A/c No: {S.company_bank_account} · SWIFT: {S.company_bank_swift} · IFSC: {S.company_bank_ifsc}", small),
            Spacer(1, 6 * mm)]


def _sign(declaration: str | None = None) -> list:
    out = []
    if declaration:
        out += [_p(declaration, small), Spacer(1, 6 * mm)]
    out.append(_p(f"For <b>{S.company_name}</b><br/><br/><br/>Authorised Signatory", right))
    return out


def _build(story: list) -> bytes:
    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                      topMargin=12 * mm, bottomMargin=12 * mm).build(story)
    return buf.getvalue()


# ------------------------------------------------------------------ public builders
def quotation_pdf(q: Quotation) -> bytes:
    story = _header("QUOTATION")
    story += _party_and_meta(q.customer, [("Quotation No.", q.number), ("Date", q.quote_date.strftime("%d %b %Y")),
                                          ("Valid until", q.valid_until.strftime("%d %b %Y") if q.valid_until else ""),
                                          ("Your RFQ", q.rfq.number if q.rfq else ""), ("Currency", q.currency)])
    story += _lines_table(q)
    story += _terms(q, ["<b>Lead time:</b> 25–35 days from receipt of advance / confirmed order."])
    story += _sign()
    return _build(story)


def proforma_pdf(o: SalesOrder) -> bytes:
    story = _header("PROFORMA INVOICE")
    story += _party_and_meta(o.customer, [("PI No.", o.pi_number), ("Date", o.order_date.strftime("%d %b %Y")),
                                          ("Sales Order", o.number), ("Buyer PO", o.buyer_po),
                                          ("Expected ship", o.expected_ship_date.strftime("%d %b %Y") if o.expected_ship_date else ""),
                                          ("Currency", o.currency)])
    story += _lines_table(o)
    story += _terms(o)
    story += _bank()
    story += _sign("This proforma invoice is issued for advance payment / opening of Letter of Credit and is not a tax invoice.")
    return _build(story)


def commercial_invoice_pdf(inv: Invoice) -> bytes:
    s = inv.shipment
    story = _header("COMMERCIAL INVOICE")
    story += _party_and_meta(inv.customer, [
        ("Invoice No.", inv.number), ("Date", inv.invoice_date.strftime("%d %b %Y")),
        ("Buyer PO", inv.order.buyer_po), ("PI No.", inv.order.pi_number),
        ("Due date", inv.due_date.strftime("%d %b %Y") if inv.due_date else ""),
        ("Vessel / Voy", s.vessel_voyage if s else ""), ("Container", s.container_no if s else ""),
        ("B/L / AWB", s.bl_awb_no if s else ""), ("Country of origin", "India")])
    story += _lines_table(inv)
    story += _terms(inv)
    paid = inv.amount_paid
    if paid:
        story += [_p(f"Less advance / payments received: <b>{_money(paid, inv.currency)}</b> · "
                     f"Balance due: <b>{_money(inv.balance, inv.currency)}</b>"), Spacer(1, 4 * mm)]
    story += _bank()
    story += _sign("Declaration: We declare that this invoice shows the actual price of the goods described "
                   "and that all particulars are true and correct. Supply meant for export under LUT without payment of IGST.")
    return _build(story)


def packing_list_pdf(inv: Invoice) -> bytes:
    s = inv.shipment
    story = _header("PACKING LIST")
    story += _party_and_meta(inv.customer, [
        ("Invoice No.", inv.number), ("Date", inv.invoice_date.strftime("%d %b %Y")),
        ("Container", f"{s.container_no} ({s.container_type})" if s else ""), ("Seal No.", s.seal_no if s else ""),
        ("Vessel / Voy", s.vessel_voyage if s else ""), ("Port of loading", inv.port_of_loading),
        ("Port of discharge", inv.port_of_discharge)])
    rows = [["#", "Description", "Cartons", "Pcs/Ctn", "Total Pcs", "Net Wt (kg)", "Gross Wt (kg)", "CBM"]]
    tc = tn = tg = tv = 0
    carton_from = 1
    for n, i in enumerate(inv.items, 1):
        marks = f"C/No {carton_from}–{carton_from + i.qty_cartons - 1}"
        carton_from += i.qty_cartons
        rows.append([n, _p(f"{i.description}<br/><font size=7 color='#666'>{i.sku} · {marks}</font>", small),
                     f"{i.qty_cartons:,}", f"{i.pcs_per_carton:,}", f"{i.qty_cartons * i.pcs_per_carton:,}",
                     f"{i.net_weight_kg:,.2f}", f"{i.gross_weight_kg:,.2f}", f"{i.cbm:,.3f}"])
        tc += i.qty_cartons; tn += i.net_weight_kg; tg += i.gross_weight_kg; tv += i.cbm
    rows.append(["", _p("<b>TOTAL</b>", small), f"{tc:,}", "", "", f"{tn:,.2f}", f"{tg:,.2f}", f"{tv:,.3f}"])
    t = Table(rows, colWidths=[7 * mm, 62 * mm, 16 * mm, 15 * mm, 20 * mm, 20 * mm, 22 * mm, 18 * mm], repeatRows=1)
    st = _grid_style(len(rows))
    st.add("ALIGN", (2, 1), (-1, -1), "RIGHT")
    st.add("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")
    t.setStyle(st)
    story += [t, Spacer(1, 6 * mm),
              _p(f"Shipping marks: {inv.customer.company_name} / {inv.port_of_discharge} / Made in India", small),
              Spacer(1, 8 * mm)]
    story += _sign()
    return _build(story)
