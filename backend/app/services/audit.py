from sqlalchemy.orm import Session

from ..models import AuditLog, User


def audit(db: Session, user: User | None, entity: str, entity_id: int, action: str, detail: str = ""):
    db.add(AuditLog(entity=entity, entity_id=entity_id, action=action, detail=detail,
                    user_email=user.email if user else ""))
