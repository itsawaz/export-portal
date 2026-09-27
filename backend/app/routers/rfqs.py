from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import buyer_user, current_user, ensure_can_see, is_staff, staff_user
from ..config import settings
from ..database import get_db
from ..models import RFQ, ProductVariant, Quotation, QuotationItem, RFQItem, User
from ..schemas import RFQIn
from ..services.audit import audit
from ..services.notify import notify_sales
from ..services.numbering import next_number

router = APIRouter(prefix="/api/rfqs", tags=["rfq"])


def _get(db: Session, rfq_id: int, user: User) -> RFQ:
    r = db.get(RFQ, rfq_id)
    if not r:
        raise HTTPException(404, "RFQ not found")
    ensure_can_see(user, r.customer_id)
    return r


@router.post("", status_code=201)
def create_rfq(body: RFQIn, user: User = Depends(buyer_user), db: Session = Depends(get_db)):
    r = RFQ(number=next_number(db, "rfq"), customer_id=user.customer_id, incoterm=body.incoterm,
            destination_port=body.destination_port, target_date=body.target_date,
            private_label=body.private_label, notes=body.notes)
    warnings = []
    for it in body.items:
        v = db.get(ProductVariant, it.variant_id)
        if not v or not v.is_active:
            raise HTTPException(400, f"Product variant {it.variant_id} is not available")
        if it.qty_cartons < v.moq_cartons:
            warnings.append(f"{v.sku}: {it.qty_cartons} cartons is below MOQ of {v.moq_cartons}")
        r.items.append(RFQItem(variant_id=v.id, qty_cartons=it.qty_cartons, notes=it.notes))
    db.add(r)
    db.flush()
    audit(db, user, "rfq", r.id, "submitted")
    db.commit()
    notify_sales(f"New RFQ {r.number} from {r.customer.company_name}",
                 "\n".join(f"- {i.variant.sku} × {i.qty_cartons} ctn" for i in r.items))
    return ser.rfq(r) | {"warnings": warnings}


@router.get("")
def list_rfqs(status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(RFQ).order_by(RFQ.id.desc())
    if not is_staff(user):
        stmt = stmt.where(RFQ.customer_id == user.customer_id)
    if status:
        stmt = stmt.where(RFQ.status == status)
    return [ser.rfq(r) for r in db.scalars(stmt).all()]


@router.get("/{rfq_id}")
def get_rfq(rfq_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _get(db, rfq_id, user)
    out = ser.rfq(r)
    qs = db.scalars(select(Quotation).where(Quotation.rfq_id == r.id)).all()
    out["quotations"] = [{"id": q.id, "number": q.number, "status": q.status} for q in qs
                         if is_staff(user) or q.status != "draft"]
    return out


@router.post("/{rfq_id}/cancel")
def cancel_rfq(rfq_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _get(db, rfq_id, user)
    if r.status not in ("submitted",):
        raise HTTPException(400, f"RFQ is already {r.status}")
    r.status = "cancelled"
    audit(db, user, "rfq", r.id, "cancelled")
    db.commit()
    return ser.rfq(r)


@router.post("/{rfq_id}/quotation", status_code=201)
def quote_from_rfq(rfq_id: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    """Create a draft quotation pre-filled from the RFQ at list prices; staff then edit and send it."""
    r = _get(db, rfq_id, user)
    if r.status == "cancelled":
        raise HTTPException(400, "RFQ was cancelled")
    c = r.customer
    q = Quotation(number=next_number(db, "quotation"), rfq_id=r.id, customer_id=c.id,
                  currency=c.currency or settings.default_currency, incoterm=r.incoterm,
                  port_of_loading=settings.default_port_of_loading,
                  port_of_discharge=r.destination_port or c.default_port,
                  payment_terms=c.payment_terms or settings.default_payment_terms,
                  valid_until=date.today() + timedelta(days=settings.quote_validity_days),
                  notes=("Private label requested. " if r.private_label else "") + (r.notes or ""))
    for it in r.items:
        v = it.variant
        q.items.append(QuotationItem(variant_id=v.id, description=f"{v.product.name} — {v.size_label}",
                                     sku=v.sku, hs_code=v.hs_code, pcs_per_carton=v.pcs_per_carton,
                                     qty_cartons=it.qty_cartons, unit_price=v.list_price))
    db.add(q)
    r.status = "quoted"
    db.flush()
    audit(db, user, "quotation", q.id, "created from RFQ", r.number)
    db.commit()
    return ser.quotation(q)
