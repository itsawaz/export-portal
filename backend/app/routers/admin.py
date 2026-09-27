"""Back-office endpoints: dashboard, customers, enquiries, catalogue, users."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import admin_user, hash_password, staff_user
from ..database import get_db
from ..models import (RFQ, AuditLog, Category, Customer, Enquiry, Invoice, Product, ProductVariant,
                      Quotation, SalesOrder, Shipment, User)
from ..schemas import CategoryIn, CustomerIn, ProductIn, StatusIn
from ..services.workflow import SAILED, STAGE_INDEX

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ------------------------------------------------------------------ dashboard
@router.get("/dashboard")
def dashboard(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    count = lambda model, *where: db.scalar(select(func.count()).select_from(model).where(*where)) or 0
    open_invoices = db.scalars(select(Invoice).where(Invoice.status.in_(["issued", "partially_paid"]))).all()
    today = date.today()
    receivable = round(sum(i.balance for i in open_invoices), 2)
    overdue = [i for i in open_invoices if i.due_date and i.due_date < today]
    orders = db.scalars(select(SalesOrder).where(SalesOrder.status.notin_(["cancelled"]))).all()
    in_transit = [s for s in db.scalars(select(Shipment)).all()
                  if SAILED <= STAGE_INDEX.get(s.status, 0) < STAGE_INDEX["delivered"]]
    by_status: dict[str, int] = {}
    for o in orders:
        by_status[o.status] = by_status.get(o.status, 0) + 1
    fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    return {
        "new_enquiries": count(Enquiry, Enquiry.status == "new"),
        "open_rfqs": count(RFQ, RFQ.status == "submitted"),
        "quotes_awaiting_buyer": count(Quotation, Quotation.status == "sent"),
        "draft_quotes": count(Quotation, Quotation.status == "draft"),
        "orders_open": sum(v for k, v in by_status.items() if k not in ("delivered", "closed")),
        "orders_by_status": by_status,
        "shipments_in_transit": len(in_transit),
        "receivable": receivable,
        "overdue_count": len(overdue),
        "overdue_amount": round(sum(i.balance for i in overdue), 2),
        "order_value_fy": round(sum(o.total for o in orders if o.order_date >= fy_start), 2),
        "customers": count(Customer),
        "recent_orders": [ser.order(o, brief=True) for o in sorted(orders, key=lambda o: o.id, reverse=True)[:6]],
        "upcoming_arrivals": [ser.shipment(s, brief=True) for s in sorted(in_transit, key=lambda s: s.eta or today)[:6]],
        "overdue_invoices": [ser.invoice(i, brief=True) for i in overdue[:6]],
    }


@router.get("/audit")
def audit_log(entity: str | None = None, entity_id: int | None = None,
              user: User = Depends(staff_user), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(200)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    return [{"id": a.id, "entity": a.entity, "entity_id": a.entity_id, "action": a.action, "detail": a.detail,
             "user_email": a.user_email, "created_at": a.created_at.isoformat()} for a in db.scalars(stmt)]


# ------------------------------------------------------------------ customers
@router.get("/customers")
def customers(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    return [ser.customer(c) for c in db.scalars(select(Customer).order_by(Customer.company_name)).all()]


@router.post("/customers", status_code=201)
def create_customer(body: CustomerIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    c = Customer(**body.model_dump())
    db.add(c)
    db.commit()
    return ser.customer(c)


@router.put("/customers/{cid}")
def update_customer(cid: int, body: CustomerIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "Customer not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return ser.customer(c)


# ------------------------------------------------------------------ enquiries
@router.get("/enquiries")
def enquiries(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    return [ser.enquiry(e) for e in db.scalars(select(Enquiry).order_by(Enquiry.id.desc())).all()]


@router.post("/enquiries/{eid}/status")
def enquiry_status(eid: int, body: StatusIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    e = db.get(Enquiry, eid)
    if not e:
        raise HTTPException(404, "Enquiry not found")
    if body.status not in ("new", "contacted", "converted", "closed"):
        raise HTTPException(400, "Invalid status")
    e.status = body.status
    db.commit()
    return ser.enquiry(e)


# ------------------------------------------------------------------ catalogue
@router.get("/products")
def all_products(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    ps = db.scalars(select(Product).order_by(Product.sort_order, Product.name)).all()
    return [ser.product(p, show_price=True) for p in ps]


@router.get("/variants")
def all_variants(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    vs = db.scalars(select(ProductVariant).where(ProductVariant.is_active.is_(True))).all()
    return [ser.variant(v, True) | {"product_name": v.product.name} for v in vs]


def _save_product(p: Product, body: ProductIn, db: Session):
    for k, v in body.model_dump(exclude={"variants"}).items():
        setattr(p, k, v)
    existing = {v.id: v for v in p.variants}
    keep = set()
    for vin in body.variants:
        data = vin.model_dump(exclude={"id"})
        if vin.id and vin.id in existing:
            for k, v in data.items():
                setattr(existing[vin.id], k, v)
            keep.add(vin.id)
        else:
            p.variants.append(ProductVariant(**data))
    # variants removed from the form are deactivated, not deleted (orders may reference them)
    for vid, v in existing.items():
        if vid not in keep:
            v.is_active = False


@router.post("/products", status_code=201)
def create_product(body: ProductIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    p = Product()
    _save_product(p, body, db)
    db.add(p)
    db.commit()
    return ser.product(p, True)


@router.put("/products/{pid}")
def update_product(pid: int, body: ProductIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "Product not found")
    _save_product(p, body, db)
    db.commit()
    return ser.product(p, True)


@router.post("/categories", status_code=201)
def create_category(body: CategoryIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    c = Category(**body.model_dump())
    db.add(c)
    db.commit()
    return {"id": c.id, **body.model_dump()}


@router.put("/categories/{cid}")
def update_category(cid: int, body: CategoryIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    c = db.get(Category, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return {"id": c.id, **body.model_dump()}


# ------------------------------------------------------------------ users
class StaffIn(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    role: str = "staff"


@router.get("/users")
def users(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    return [ser.user(u) for u in db.scalars(select(User).order_by(User.role, User.email)).all()]


@router.post("/users", status_code=201)
def create_staff(body: StaffIn, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    if body.role not in ("admin", "staff"):
        raise HTTPException(400, "Role must be admin or staff")
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(400, "E-mail already in use")
    u = User(email=body.email.lower(), full_name=body.full_name, role=body.role,
             password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return ser.user(u)


@router.post("/users/{uid}/active")
def set_active(uid: int, active: bool, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == user.id:
        raise HTTPException(400, "You cannot deactivate yourself")
    u.is_active = active
    db.commit()
    return ser.user(u)
