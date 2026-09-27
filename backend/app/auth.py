from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, settings.secret_key, ALGORITHM)


def _user_from_token(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    user = db.get(User, int(payload["sub"]))
    return user if user and user.is_active else None


def optional_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User | None:
    return _user_from_token(token, db)


def current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = _user_from_token(token, db)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def staff_user(user: User = Depends(current_user)) -> User:
    if user.role not in ("admin", "staff"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access required")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def buyer_user(user: User = Depends(current_user)) -> User:
    if user.role != "buyer" or not user.customer_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Buyer account required")
    if settings.require_buyer_approval and not user.customer.is_approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is awaiting approval")
    return user


def is_staff(user: User | None) -> bool:
    return bool(user and user.role in ("admin", "staff"))


def ensure_can_see(user: User, customer_id: int):
    """Staff see everything; a buyer sees only their own company's documents."""
    if is_staff(user):
        return
    if user.customer_id != customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
