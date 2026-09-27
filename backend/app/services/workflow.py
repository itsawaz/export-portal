"""Status rules that keep orders, shipments and invoices consistent."""
from ..models import SHIPMENT_STAGES, Invoice, SalesOrder

STAGE_INDEX = {k: i for i, (k, _) in enumerate(SHIPMENT_STAGES)}
SAILED = STAGE_INDEX["sailed"]
DELIVERED = STAGE_INDEX["delivered"]

ORDER_STATUSES = ["confirmed", "in_production", "ready_to_ship", "partially_shipped",
                  "shipped", "delivered", "closed", "cancelled"]


def recompute_invoice_status(inv: Invoice) -> None:
    if inv.status == "cancelled":
        return
    paid = inv.amount_paid
    if paid <= 0:
        inv.status = "issued"
    elif paid + 0.005 >= inv.total:
        inv.status = "paid"
    else:
        inv.status = "partially_paid"


def recompute_order_status(o: SalesOrder) -> None:
    """Move an order forward automatically from its shipments' progress.
    Manual statuses before shipping (in_production, ready_to_ship) are left alone."""
    if o.status in ("cancelled", "closed"):
        return
    ordered = {it.id: it.qty_cartons for it in o.items}
    sailed: dict[int, int] = {}
    delivered: dict[int, int] = {}
    for s in o.shipments:
        idx = STAGE_INDEX.get(s.status, 0)
        for si in s.items:
            if idx >= SAILED:
                sailed[si.order_item_id] = sailed.get(si.order_item_id, 0) + si.qty_cartons
            if idx >= DELIVERED:
                delivered[si.order_item_id] = delivered.get(si.order_item_id, 0) + si.qty_cartons
    fully = lambda m: all(m.get(k, 0) >= q for k, q in ordered.items())
    if ordered and fully(delivered):
        o.status = "delivered"
    elif ordered and fully(sailed):
        o.status = "shipped"
    elif sailed:
        o.status = "partially_shipped"
    # fully paid & delivered orders close themselves
    if o.status == "delivered" and o.invoices and all(i.status in ("paid", "cancelled") for i in o.invoices):
        o.status = "closed"
