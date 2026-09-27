from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import create_token, current_user, hash_password, verify_password
from ..config import settings
from ..database import get_db
from ..models import Customer, User
from ..schemas import LoginIn, ProfileIn, RegisterIn
from ..services.notify import notify_sales

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session(user: User) -> dict:
    return {"access_token": create_token(user), "token_type": "bearer", "user": ser.user(user)}


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(400, "An account with this e-mail already exists")
    cust = Customer(company_name=body.company_name, country=body.country, contact_name=body.full_name,
                    email=email, phone=body.phone, address=body.address, tax_id=body.tax_id,
                    currency=settings.default_currency, payment_terms=settings.default_payment_terms,
                    is_approved=not settings.require_buyer_approval)
    db.add(cust)
    db.flush()
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
                role="buyer", customer_id=cust.id)
    db.add(user)
    db.commit()
    notify_sales("New buyer registration", f"{body.company_name} ({body.country}) — {body.full_name} <{email}>")
    return _session(user)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(401, "Invalid e-mail or password")
    return _session(user)


@router.post("/token", include_in_schema=True, summary="OAuth2 form login (for the Swagger 'Authorize' button)")
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == form.username.lower()))
    if not user or not verify_password(form.password, user.password_hash) or not user.is_active:
        raise HTTPException(401, "Invalid e-mail or password")
    return {"access_token": create_token(user), "token_type": "bearer"}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return ser.user(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name
    if user.customer:
        for f in ("phone", "address", "tax_id", "default_port"):
            v = getattr(body, f)
            if v is not None:
                setattr(user.customer, f, v)
    db.commit()
    return ser.user(user)
