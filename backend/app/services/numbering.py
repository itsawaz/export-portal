"""Document numbers in Indian fiscal-year format, e.g. QT/2026-27/0007.

The fiscal year runs April–March, which is how Indian exporters number
invoices for GST and for shipping bills.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DocSequence

PREFIXES = {
    "rfq": "RFQ",
    "quotation": "QT",
    "order": "SO",
    "proforma": "PI",
    "shipment": "SH",
    "invoice": "EXP",
}


def fiscal_year(d: date | None = None) -> str:
    d = d or date.today()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def next_number(db: Session, kind: str, on: date | None = None) -> str:
    prefix = PREFIXES[kind]
    fy = fiscal_year(on)
    seq = db.scalar(select(DocSequence).where(DocSequence.prefix == prefix,
                                              DocSequence.fiscal_year == fy).with_for_update())
    if not seq:
        seq = DocSequence(prefix=prefix, fiscal_year=fy, last_value=0)
        db.add(seq)
    seq.last_value += 1
    db.flush()
    return f"{prefix}/{fy}/{seq.last_value:04d}"
