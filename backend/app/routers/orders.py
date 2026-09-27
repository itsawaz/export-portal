from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import current_user, ensure_can_see, is_staff, staff_user
from ..database import get_db
from ..models import SalesOrder, User
from ..schemas import OrderStatusIn
from ..services.audit import audit
from ..services.notify import send_email
from ..services.pdfs import proforma_pdf
from ..services.workflow import ORDER_STATUSES

router = APIRouter(prefix="/api/orders", tags=["order"])


def _get(db: Session, oid: int, user: User) -> SalesOrder:
    o = db.get(SalesOrder, oid)
    if not o:
        raise HTTPException(404, "Order not found")
    ensure_can_see(user, o.customer_id)
    return o


@router.get("")
def list_orders(status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(SalesOrder).order_by(SalesOrder.id.desc())
    if not is_staff(user):
        stmt = stmt.where(SalesOrder.customer_id == user.customer_id)
    if status:
        stmt = stmt.where(SalesOrder.status == status)
    return [ser.order(o, brief=True) for o in db.scalars(stmt).all()]


@router.get("/statuses")
def statuses():
    return ORDER_STATUSES


@router.get("/{oid}")
def get_order(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser.order(_get(db, oid, user))


@router.post("/{oid}/status")
def set_status(oid: int, body: OrderStatusIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    o = _get(db, oid, user)
    if body.status not in ORDER_STATUSES:
        raise HTTPException(400, f"Status must be one of {ORDER_STATUSES}")
    if body.status == "cancelled" and (o.shipments or o.payments):
        raise HTTPException(400, "Order has shipments or payments; reverse those first")
    old = o.status
    o.status = body.status
    if body.expected_ship_date:
        o.expected_ship_date = body.expected_ship_date
    audit(db, user, "order", o.id, f"status {old} → {o.status}")
    db.commit()
    send_email([u.email for u in o.customer.users], f"Order {o.number}: {o.status.replace('_', ' ')}",
               f"Your order {o.number} (PO {o.buyer_po or '-'}) is now: {o.status.replace('_', ' ')}.")
    return ser.order(o)


@router.get("/{oid}/proforma.pdf")
def proforma(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = _get(db, oid, user)
    return Response(proforma_pdf(o), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{o.pi_number.replace("/", "-")}.pdf"'})
