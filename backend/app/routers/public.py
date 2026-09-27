from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import optional_user
from ..config import settings
from ..database import get_db
from ..models import Category, Enquiry, Product, Shipment, User
from ..schemas import EnquiryIn
from ..services.notify import notify_sales

router = APIRouter(prefix="/api/public", tags=["public"])


def _show_prices(user: User | None) -> bool:
    """Indicative prices are shown to signed-in buyers and staff only."""
    return user is not None


@router.get("/company")
def company():
    return settings.public_profile()


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    cats = db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "description": c.description,
             "product_count": sum(1 for p in c.products if p.is_active)} for c in cats]


@router.get("/products")
def products(category: str | None = None, q: str | None = None,
             db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    stmt = select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order, Product.name)
    if category:
        stmt = stmt.join(Category).where(Category.slug == category)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Product.name).like(like), func.lower(Product.short_description).like(like)))
    show = _show_prices(user)
    return [ser.product(p, show) for p in db.scalars(stmt).all()]


@router.get("/products/{slug}")
def product(slug: str, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    p = db.scalar(select(Product).where(Product.slug == slug, Product.is_active.is_(True)))
    if not p:
        raise HTTPException(404, "Product not found")
    return ser.product(p, _show_prices(user))


@router.post("/enquiries", status_code=201)
def create_enquiry(body: EnquiryIn, db: Session = Depends(get_db)):
    e = Enquiry(**body.model_dump())
    db.add(e)
    db.commit()
    notify_sales(f"New enquiry from {e.full_name} ({e.country})",
                 f"{e.full_name} <{e.email}> — {e.company}\nInterest: {e.product_interest}\n\n{e.message}")
    return {"ok": True, "id": e.id}


@router.get("/track")
def track(number: str, ref: str, db: Session = Depends(get_db)):
    """Public shipment tracking. Needs the shipment number AND the B/L, AWB or
    container number, so a guessed shipment number alone reveals nothing."""
    s = db.scalar(select(Shipment).where(Shipment.number == number.strip()))
    ref = ref.strip().upper()
    if not s or ref not in {x.upper() for x in (s.bl_awb_no, s.container_no) if x}:
        raise HTTPException(404, "No shipment matches that number and reference")
    d = ser.shipment(s)
    # hide commercial details on the public page
    return {k: d[k] for k in ("number", "mode", "carrier", "vessel_voyage", "container_no", "bl_awb_no",
                              "port_of_loading", "port_of_discharge", "etd", "eta", "status",
                              "status_label", "events", "stages", "tracking_url")}
