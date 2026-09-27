from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import current_user, ensure_can_see, is_staff, staff_user
from ..config import settings
from ..database import get_db
from ..models import Customer, OrderItem, Quotation, QuotationItem, SalesOrder, User
from ..schemas import QuotationIn, QuoteDecisionIn
from ..services.audit import audit
from ..services.notify import notify_sales, send_email
from ..services.numbering import next_number
from ..services.pdfs import quotation_pdf

router = APIRouter(prefix="/api/quotations", tags=["quotation"])


def _get(db: Session, qid: int, user: User) -> Quotation:
    q = db.get(Quotation, qid)
    if not q or (not is_staff(user) and q.status == "draft"):
        raise HTTPException(404, "Quotation not found")
    ensure_can_see(user, q.customer_id)
    return q


def _apply(q: Quotation, body: QuotationIn):
    for f in ("currency", "incoterm", "port_of_loading", "port_of_discharge", "payment_terms",
              "freight", "insurance", "discount", "notes", "valid_until"):
        setattr(q, f, getattr(body, f))
    q.items.clear()
    for it in body.items:
        q.items.append(QuotationItem(**it.model_dump()))


def _expire(q: Quotation):
    if q.status == "sent" and q.valid_until and q.valid_until < date.today():
        q.status = "expired"


@router.get("")
def list_quotations(status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Quotation).order_by(Quotation.id.desc())
    if not is_staff(user):
        stmt = stmt.where(Quotation.customer_id == user.customer_id, Quotation.status != "draft")
    if status:
        stmt = stmt.where(Quotation.status == status)
    qs = db.scalars(stmt).all()
    for q in qs:
        _expire(q)
    db.commit()
    return [ser.quotation(q) for q in qs]


@router.get("/{qid}")
def get_quotation(qid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, qid, user)
    _expire(q)
    db.commit()
    return ser.quotation(q)


@router.post("", status_code=201)
def create_quotation(body: QuotationIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    if not db.get(Customer, body.customer_id):
        raise HTTPException(400, "Unknown customer")
    q = Quotation(number=next_number(db, "quotation"), customer_id=body.customer_id, rfq_id=body.rfq_id)
    _apply(q, body)
    q.valid_until = q.valid_until or date.today() + timedelta(days=settings.quote_validity_days)
    db.add(q)
    db.flush()
    audit(db, user, "quotation", q.id, "created")
    db.commit()
    return ser.quotation(q)


@router.put("/{qid}")
def update_quotation(qid: int, body: QuotationIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    q = _get(db, qid, user)
    if q.status not in ("draft", "sent"):
        raise HTTPException(400, f"A {q.status} quotation cannot be edited")
    _apply(q, body)
    audit(db, user, "quotation", q.id, "updated")
    db.commit()
    return ser.quotation(q)


@router.post("/{qid}/send")
def send_quotation(qid: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    q = _get(db, qid, user)
    if q.status not in ("draft", "sent", "expired"):
        raise HTTPException(400, f"Quotation is {q.status}")
    q.status = "sent"
    q.quote_date = date.today()
    if not q.valid_until or q.valid_until < date.today():
        q.valid_until = date.today() + timedelta(days=settings.quote_validity_days)
    audit(db, user, "quotation", q.id, "sent")
    db.commit()
    send_email([u.email for u in q.customer.users] or [q.customer.email],
               f"Quotation {q.number} from {settings.company_name}",
               f"Dear {q.customer.contact_name or 'Sir/Madam'},\n\nYour quotation {q.number} for "
               f"{q.currency} {q.total:,.2f} ({q.incoterm}) is ready in your buyer portal. "
               f"It is valid until {q.valid_until:%d %b %Y}.\n\nRegards,\n{settings.company_name}")
    return ser.quotation(q)


@router.post("/{qid}/decision")
def decide(qid: int, body: QuoteDecisionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Buyer accepts or rejects a sent quotation. Accepting creates a Sales Order with a Proforma Invoice number."""
    q = _get(db, qid, user)
    _expire(q)
    if q.status != "sent":
        raise HTTPException(400, f"Quotation is {q.status} and can no longer be {'accepted' if body.accept else 'rejected'}")
    q.buyer_response = body.response
    if not body.accept:
        q.status = "rejected"
        audit(db, user, "quotation", q.id, "rejected", body.response)
        db.commit()
        notify_sales(f"Quotation {q.number} rejected", body.response or "(no reason given)")
        return {"quotation": ser.quotation(q), "order": None}

    q.status = "accepted"
    o = SalesOrder(number=next_number(db, "order"), pi_number=next_number(db, "proforma"),
                   quotation_id=q.id, customer_id=q.customer_id, buyer_po=body.buyer_po,
                   currency=q.currency, incoterm=q.incoterm, port_of_loading=q.port_of_loading,
                   port_of_discharge=q.port_of_discharge, payment_terms=q.payment_terms,
                   freight=q.freight, insurance=q.insurance, discount=q.discount, notes=q.notes,
                   expected_ship_date=date.today() + timedelta(days=30))
    for it in q.items:
        o.items.append(OrderItem(variant_id=it.variant_id, description=it.description, sku=it.sku,
                                 hs_code=it.hs_code, pcs_per_carton=it.pcs_per_carton,
                                 qty_cartons=it.qty_cartons, unit_price=it.unit_price))
    db.add(o)
    db.flush()
    audit(db, user, "quotation", q.id, "accepted")
    audit(db, user, "order", o.id, "created from quotation", q.number)
    db.commit()
    notify_sales(f"Order {o.number} confirmed by {o.customer.company_name}",
                 f"Quotation {q.number} accepted. PI {o.pi_number} for {o.currency} {o.total:,.2f}. Buyer PO: {o.buyer_po}")
    return {"quotation": ser.quotation(q), "order": ser.order(o)}


@router.get("/{qid}/pdf")
def pdf(qid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, qid, user)
    return Response(quotation_pdf(q), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{q.number.replace("/", "-")}.pdf"'})
