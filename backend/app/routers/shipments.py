from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import current_user, ensure_can_see, is_staff, staff_user
from ..database import get_db
from ..models import SHIPMENT_STAGES, SalesOrder, Shipment, ShipmentEvent, ShipmentItem, User
from ..schemas import ShipmentEventIn, ShipmentIn, ShipmentUpdateIn
from ..services.audit import audit
from ..services.notify import send_email
from ..services.numbering import next_number
from ..services.tracking import PROVIDERS, get_provider
from ..services.workflow import STAGE_INDEX, recompute_order_status

router = APIRouter(prefix="/api/shipments", tags=["shipment"])
STAGE_LABELS = dict(SHIPMENT_STAGES)


def _get(db: Session, sid: int, user: User) -> Shipment:
    s = db.get(Shipment, sid)
    if not s:
        raise HTTPException(404, "Shipment not found")
    ensure_can_see(user, s.order.customer_id)
    return s


def _add_event(s: Shipment, status: str, location="", note="", when=None, source="manual", by=""):
    if status not in STAGE_INDEX:
        raise HTTPException(400, f"Unknown stage '{status}'")
    s.events.append(ShipmentEvent(status=status, location=location, note=note,
                                  event_time=when or datetime.utcnow(), source=source, created_by=by))
    # shipment status = furthest stage reached (events may be entered out of order)
    if STAGE_INDEX[status] >= STAGE_INDEX.get(s.status, 0):
        s.status = status


@router.get("")
def list_shipments(status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Shipment).join(SalesOrder).order_by(Shipment.id.desc())
    if not is_staff(user):
        stmt = stmt.where(SalesOrder.customer_id == user.customer_id)
    if status:
        stmt = stmt.where(Shipment.status == status)
    return [ser.shipment(s, brief=True) for s in db.scalars(stmt).all()]


@router.get("/stages")
def stages():
    return [{"key": k, "label": l} for k, l in SHIPMENT_STAGES]


@router.get("/providers")
def providers():
    return [{"key": p.key, "label": p.label} for p in PROVIDERS.values()]


@router.get("/{sid}")
def get_shipment(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser.shipment(_get(db, sid, user))


@router.post("", status_code=201)
def create_shipment(body: ShipmentIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    o = db.get(SalesOrder, body.order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    if o.status in ("cancelled", "closed"):
        raise HTTPException(400, f"Order is {o.status}")
    shipped = ser.order_totals(o)["shipped_by_item"]
    pending = {it.id: it.qty_cartons - shipped.get(it.id, 0) for it in o.items}
    lines = body.items or [{"order_item_id": k, "qty_cartons": v} for k, v in pending.items() if v > 0]
    lines = [l if isinstance(l, dict) else l.model_dump() for l in lines]
    if not lines:
        raise HTTPException(400, "Nothing left to ship on this order")
    data = body.model_dump(exclude={"items", "order_id"})
    data["port_of_loading"] = data["port_of_loading"] or o.port_of_loading
    data["port_of_discharge"] = data["port_of_discharge"] or o.port_of_discharge
    s = Shipment(number=next_number(db, "shipment"), order=o, **data)
    for l in lines:
        if l["order_item_id"] not in pending:
            raise HTTPException(400, f"Order line {l['order_item_id']} is not on order {o.number}")
        if l["qty_cartons"] > pending[l["order_item_id"]]:
            raise HTTPException(400, f"Line {l['order_item_id']}: only {pending[l['order_item_id']]} cartons left to ship")
        s.items.append(ShipmentItem(order_item_id=l["order_item_id"], qty_cartons=l["qty_cartons"]))
    _add_event(s, "planned", data["port_of_loading"], "Shipment booked", by=user.email)
    db.add(s)
    db.flush()
    if o.status in ("confirmed", "in_production"):
        o.status = "ready_to_ship"
    audit(db, user, "shipment", s.id, "created", o.number)
    db.commit()
    return ser.shipment(s)


@router.patch("/{sid}")
def update_shipment(sid: int, body: ShipmentUpdateIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    s = _get(db, sid, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    audit(db, user, "shipment", s.id, "updated")
    db.commit()
    return ser.shipment(s)


@router.post("/{sid}/events", status_code=201)
def add_event(sid: int, body: ShipmentEventIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    s = _get(db, sid, user)
    _add_event(s, body.status, body.location, body.note, body.event_time, by=user.email)
    db.flush()
    recompute_order_status(s.order)
    audit(db, user, "shipment", s.id, f"event {body.status}")
    db.commit()
    send_email([u.email for u in s.order.customer.users],
               f"Shipment {s.number}: {STAGE_LABELS[body.status]}",
               f"Update on your order {s.order.number}: {STAGE_LABELS[body.status]}"
               f"{' at ' + body.location if body.location else ''}.\n{body.note}\n"
               f"Container: {s.container_no or '-'} · B/L: {s.bl_awb_no or '-'} · ETA: {s.eta or '-'}")
    return ser.shipment(s)


@router.delete("/{sid}/events/{eid}")
def delete_event(sid: int, eid: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    s = _get(db, sid, user)
    ev = next((e for e in s.events if e.id == eid), None)
    if not ev:
        raise HTTPException(404, "Event not found")
    s.events.remove(ev)
    s.status = max((e.status for e in s.events), key=lambda k: STAGE_INDEX[k], default="planned")
    db.flush()
    recompute_order_status(s.order)
    db.commit()
    return ser.shipment(s)


@router.post("/{sid}/refresh-tracking")
def refresh_tracking(sid: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    """Pull events from the shipment's tracking provider (no-op for 'manual')."""
    s = _get(db, sid, user)
    provider = get_provider(s.tracking_provider)
    seen = {(e.status, e.event_time) for e in s.events}
    added = 0
    for ev in provider.fetch_events(s):
        if (ev.status, ev.event_time) not in seen:
            _add_event(s, ev.status, ev.location, ev.note, ev.event_time, source=provider.key)
            added += 1
    db.flush()
    recompute_order_status(s.order)
    db.commit()
    return {"added": added, "shipment": ser.shipment(s)}
