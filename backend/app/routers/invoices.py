from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import current_user, ensure_can_see, is_staff, staff_user
from ..database import get_db
from ..models import Invoice, InvoiceItem, Shipment, User
from ..schemas import InvoiceFromShipmentIn
from ..services.audit import audit
from ..services.notify import send_email
from ..services.numbering import next_number
from ..services.pdfs import commercial_invoice_pdf, packing_list_pdf
from ..services.workflow import recompute_invoice_status, recompute_order_status

router = APIRouter(prefix="/api/invoices", tags=["invoice"])


def _get(db: Session, iid: int, user: User) -> Invoice:
    i = db.get(Invoice, iid)
    if not i:
        raise HTTPException(404, "Invoice not found")
    ensure_can_see(user, i.customer_id)
    return i


@router.get("")
def list_invoices(status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Invoice).order_by(Invoice.id.desc())
    if not is_staff(user):
        stmt = stmt.where(Invoice.customer_id == user.customer_id)
    if status:
        stmt = stmt.where(Invoice.status == status)
    return [ser.invoice(i, brief=True) for i in db.scalars(stmt).all()]


@router.get("/{iid}")
def get_invoice(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser.invoice(_get(db, iid, user))


@router.post("/from-shipment", status_code=201)
def from_shipment(body: InvoiceFromShipmentIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    """Raise the commercial invoice (and packing list) for exactly what is on a shipment."""
    s = db.get(Shipment, body.shipment_id)
    if not s:
        raise HTTPException(404, "Shipment not found")
    o = s.order
    if any(i.shipment_id == s.id and i.status != "cancelled" for i in o.invoices):
        raise HTTPException(400, "This shipment already has an invoice")
    inv_date = body.invoice_date or date.today()
    inv = Invoice(number=next_number(db, "invoice", inv_date), order=o, shipment_id=s.id,
                  customer_id=o.customer_id, invoice_date=inv_date,
                  due_date=inv_date + timedelta(days=body.due_days), currency=o.currency,
                  incoterm=o.incoterm, port_of_loading=s.port_of_loading or o.port_of_loading,
                  port_of_discharge=s.port_of_discharge or o.port_of_discharge,
                  payment_terms=o.payment_terms, notes=o.notes)
    for si in s.items:
        oi = si.order_item
        v = oi.variant
        inv.items.append(InvoiceItem(
            variant_id=oi.variant_id, description=oi.description, sku=oi.sku, hs_code=oi.hs_code,
            pcs_per_carton=oi.pcs_per_carton, qty_cartons=si.qty_cartons, unit_price=oi.unit_price,
            net_weight_kg=round((v.net_weight_kg if v else 0) * si.qty_cartons, 2),
            gross_weight_kg=round((v.gross_weight_kg if v else 0) * si.qty_cartons, 2),
            cbm=round((v.carton_cbm if v else 0) * si.qty_cartons, 3)))
    # freight / insurance / discount: pro-rata share of the order unless given
    share = (inv.subtotal / o.subtotal) if o.subtotal else 0
    inv.freight = body.freight if body.freight is not None else round((o.freight or 0) * share, 2)
    inv.insurance = body.insurance if body.insurance is not None else round((o.insurance or 0) * share, 2)
    inv.discount = round((o.discount or 0) * share, 2)
    db.add(inv)
    db.flush()
    if body.allocate_advance:
        remaining = inv.total
        for p in o.payments:
            if p.invoice_id is None and p.amount <= remaining + 0.005:
                p.invoice_id = inv.id
                remaining -= p.amount
        db.flush()
        db.refresh(inv)
    recompute_invoice_status(inv)
    recompute_order_status(o)
    audit(db, user, "invoice", inv.id, "created", s.number)
    db.commit()
    send_email([u.email for u in o.customer.users], f"Commercial invoice {inv.number}",
               f"Commercial invoice {inv.number} for {inv.currency} {inv.total:,.2f} against order {o.number} "
               f"is available in your portal. Balance due: {inv.currency} {inv.balance:,.2f} by {inv.due_date:%d %b %Y}.")
    return ser.invoice(inv)


@router.post("/{iid}/cancel")
def cancel(iid: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    inv = _get(db, iid, user)
    if inv.payments:
        raise HTTPException(400, "Unallocate or delete payments on this invoice first")
    inv.status = "cancelled"
    audit(db, user, "invoice", inv.id, "cancelled")
    db.commit()
    return ser.invoice(inv)


def _pdf(content: bytes, name: str) -> Response:
    return Response(content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{name.replace("/", "-")}.pdf"'})


@router.get("/{iid}/pdf")
def invoice_pdf(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = _get(db, iid, user)
    return _pdf(commercial_invoice_pdf(inv), inv.number)


@router.get("/{iid}/packing-list.pdf")
def packing_list(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = _get(db, iid, user)
    return _pdf(packing_list_pdf(inv), "PL-" + inv.number)
