from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import admin_user, current_user, is_staff, staff_user
from ..database import get_db
from ..models import Invoice, Payment, SalesOrder, User
from ..schemas import PaymentIn
from ..services.audit import audit
from ..services.notify import send_email
from ..services.workflow import recompute_invoice_status, recompute_order_status

router = APIRouter(prefix="/api/payments", tags=["payment"])


@router.get("")
def list_payments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Payment).order_by(Payment.received_on.desc(), Payment.id.desc())
    if not is_staff(user):
        stmt = stmt.where(Payment.customer_id == user.customer_id)
    return [ser.payment(p) for p in db.scalars(stmt).all()]


@router.post("", status_code=201)
def record_payment(body: PaymentIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    o = db.get(SalesOrder, body.order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    inv = None
    if body.invoice_id:
        inv = db.get(Invoice, body.invoice_id)
        if not inv or inv.order_id != o.id:
            raise HTTPException(400, "Invoice does not belong to this order")
        if inv.status == "cancelled":
            raise HTTPException(400, "Invoice is cancelled")
    data = body.model_dump()
    data["received_on"] = data["received_on"] or date.today()
    data.pop("order_id")
    p = Payment(customer_id=o.customer_id, order=o, **data)
    db.add(p)
    db.flush()
    if inv:
        db.refresh(inv)
        recompute_invoice_status(inv)
    recompute_order_status(o)
    audit(db, user, "payment", p.id, "recorded", f"{p.currency} {p.amount} {p.reference}")
    db.commit()
    send_email([u.email for u in o.customer.users], f"Payment received — {o.number}",
               f"We have received {p.currency} {p.amount:,.2f} ({p.method}, ref {p.reference or '-'}) "
               f"against order {o.number}{' / invoice ' + inv.number if inv else ''}. Thank you.")
    return ser.payment(p)


@router.delete("/{pid}")
def delete_payment(pid: int, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    p = db.get(Payment, pid)
    if not p:
        raise HTTPException(404, "Payment not found")
    inv, o = p.invoice, p.order
    db.delete(p)
    db.flush()
    if inv:
        db.refresh(inv)
        recompute_invoice_status(inv)
    audit(db, user, "payment", pid, "deleted")
    db.commit()
    return {"ok": True}
