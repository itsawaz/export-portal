"""Turn ORM objects into JSON-ready dicts for the API."""
from .models import (RFQ, SHIPMENT_STAGES, Customer, Enquiry, Invoice, Payment, Product,
                     ProductVariant, Quotation, SalesOrder, Shipment, User)

STAGE_LABELS = dict(SHIPMENT_STAGES)


def _d(v):
    return v.isoformat() if v else None


def variant(v: ProductVariant, show_price: bool) -> dict:
    out = {
        "id": v.id, "sku": v.sku, "size_label": v.size_label, "pcs_per_carton": v.pcs_per_carton,
        "carton_dims_cm": v.carton_dims_cm, "carton_cbm": v.carton_cbm,
        "net_weight_kg": v.net_weight_kg, "gross_weight_kg": v.gross_weight_kg,
        "cartons_per_20ft": v.cartons_per_20ft, "cartons_per_40hc": v.cartons_per_40hc,
        "moq_cartons": v.moq_cartons, "hs_code": v.hs_code, "is_active": v.is_active,
        "list_price": v.list_price if show_price else None,
    }
    return out


def product(p: Product, show_price: bool, with_variants=True) -> dict:
    out = {
        "id": p.id, "name": p.name, "slug": p.slug, "short_description": p.short_description,
        "description": p.description, "features": p.features or [], "image_url": p.image_url,
        "is_active": p.is_active, "sort_order": p.sort_order,
        "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug},
    }
    if with_variants:
        out["variants"] = [variant(v, show_price) for v in p.variants if v.is_active or show_price]
        prices = [v.list_price for v in p.variants if v.is_active and v.list_price]
        out["price_from"] = min(prices) if (show_price and prices) else None
        out["min_moq"] = min((v.moq_cartons for v in p.variants), default=None)
    return out


def customer(c: Customer) -> dict:
    return {
        "id": c.id, "company_name": c.company_name, "country": c.country, "contact_name": c.contact_name,
        "email": c.email, "phone": c.phone, "address": c.address, "tax_id": c.tax_id,
        "currency": c.currency, "default_incoterm": c.default_incoterm, "default_port": c.default_port,
        "payment_terms": c.payment_terms, "is_approved": c.is_approved, "created_at": _d(c.created_at),
    }


def user(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role,
        "customer_id": u.customer_id, "is_active": u.is_active,
        "customer": customer(u.customer) if u.customer else None,
    }


def enquiry(e: Enquiry) -> dict:
    return {k: getattr(e, k) for k in ("id", "full_name", "email", "company", "country",
                                       "product_interest", "message", "status")} | {"created_at": _d(e.created_at)}


def _cust_brief(c: Customer) -> dict:
    return {"id": c.id, "company_name": c.company_name, "country": c.country}


def rfq(r: RFQ) -> dict:
    return {
        "id": r.id, "number": r.number, "status": r.status, "incoterm": r.incoterm,
        "destination_port": r.destination_port, "target_date": _d(r.target_date),
        "private_label": r.private_label, "notes": r.notes, "created_at": _d(r.created_at),
        "customer": _cust_brief(r.customer),
        "items": [{
            "id": i.id, "variant_id": i.variant_id, "qty_cartons": i.qty_cartons, "notes": i.notes,
            "sku": i.variant.sku, "product_name": i.variant.product.name, "size_label": i.variant.size_label,
            "pcs_per_carton": i.variant.pcs_per_carton, "list_price": i.variant.list_price,
        } for i in r.items],
    }


def _line(i) -> dict:
    return {"id": i.id, "variant_id": i.variant_id, "description": i.description, "sku": i.sku,
            "hs_code": i.hs_code, "pcs_per_carton": i.pcs_per_carton, "qty_cartons": i.qty_cartons,
            "unit_price": i.unit_price, "amount": i.amount}


def _commercial(o) -> dict:
    return {"currency": o.currency, "incoterm": o.incoterm, "port_of_loading": o.port_of_loading,
            "port_of_discharge": o.port_of_discharge, "payment_terms": o.payment_terms,
            "freight": o.freight, "insurance": o.insurance, "discount": o.discount, "notes": o.notes,
            "subtotal": o.subtotal, "total": o.total, "items": [_line(i) for i in o.items],
            "customer": _cust_brief(o.customer)}


def quotation(q: Quotation) -> dict:
    return _commercial(q) | {
        "id": q.id, "number": q.number, "status": q.status, "rfq_id": q.rfq_id,
        "rfq_number": q.rfq.number if q.rfq else None, "quote_date": _d(q.quote_date),
        "valid_until": _d(q.valid_until), "buyer_response": q.buyer_response,
        "created_at": _d(q.created_at),
    }


def shipment(s: Shipment, brief=False) -> dict:
    out = {
        "id": s.id, "number": s.number, "order_id": s.order_id, "order_number": s.order.number,
        "customer": _cust_brief(s.order.customer), "mode": s.mode, "container_type": s.container_type,
        "carrier": s.carrier, "forwarder": s.forwarder, "vessel_voyage": s.vessel_voyage,
        "container_no": s.container_no, "seal_no": s.seal_no, "bl_awb_no": s.bl_awb_no,
        "shipping_bill_no": s.shipping_bill_no, "port_of_loading": s.port_of_loading,
        "port_of_discharge": s.port_of_discharge, "etd": _d(s.etd), "eta": _d(s.eta),
        "status": s.status, "status_label": STAGE_LABELS.get(s.status, s.status),
        "tracking_provider": s.tracking_provider, "tracking_url": s.tracking_url,
        "total_cartons": sum(i.qty_cartons for i in s.items),
    }
    if brief:
        return out
    out["items"] = [{"id": i.id, "order_item_id": i.order_item_id, "qty_cartons": i.qty_cartons,
                     "description": i.order_item.description, "sku": i.order_item.sku} for i in s.items]
    out["events"] = [{"id": e.id, "status": e.status, "label": STAGE_LABELS.get(e.status, e.status),
                      "location": e.location, "note": e.note, "event_time": _d(e.event_time),
                      "source": e.source} for e in s.events]
    out["stages"] = [{"key": k, "label": l} for k, l in SHIPMENT_STAGES]
    out["invoices"] = [{"id": i.id, "number": i.number} for i in s.order.invoices if i.shipment_id == s.id]
    return out


def payment(p: Payment) -> dict:
    return {"id": p.id, "order_id": p.order_id, "order_number": p.order.number,
            "invoice_id": p.invoice_id, "invoice_number": p.invoice.number if p.invoice else None,
            "amount": p.amount, "currency": p.currency, "method": p.method, "reference": p.reference,
            "received_on": _d(p.received_on), "inr_amount": p.inr_amount, "notes": p.notes}


def invoice(i: Invoice, brief=False) -> dict:
    out = {"id": i.id, "number": i.number, "order_id": i.order_id, "order_number": i.order.number,
           "shipment_id": i.shipment_id, "shipment_number": i.shipment.number if i.shipment else None,
           "invoice_date": _d(i.invoice_date), "due_date": _d(i.due_date), "status": i.status,
           "total": i.total, "amount_paid": i.amount_paid, "balance": i.balance, "currency": i.currency,
           "customer": _cust_brief(i.customer)}
    if brief:
        return out
    return _commercial(i) | out | {"payments": [payment(p) for p in i.payments]}


def order_totals(o: SalesOrder) -> dict:
    ordered = {it.id: it.qty_cartons for it in o.items}
    shipped: dict[int, int] = {}
    for s in o.shipments:
        for si in s.items:
            shipped[si.order_item_id] = shipped.get(si.order_item_id, 0) + si.qty_cartons
    invoiced = round(sum(i.total for i in o.invoices if i.status != "cancelled"), 2)
    paid = round(sum(p.amount for p in o.payments), 2)
    return {"ordered_cartons": sum(ordered.values()), "shipped_cartons": sum(shipped.values()),
            "invoiced": invoiced, "paid": paid, "balance_due": round(o.total - paid, 2),
            "unallocated_payments": round(sum(p.amount for p in o.payments if not p.invoice_id), 2),
            "shipped_by_item": shipped}


def order(o: SalesOrder, brief=False) -> dict:
    t = order_totals(o)
    out = {"id": o.id, "number": o.number, "pi_number": o.pi_number, "status": o.status,
           "buyer_po": o.buyer_po, "order_date": _d(o.order_date),
           "expected_ship_date": _d(o.expected_ship_date), "total": o.total, "currency": o.currency,
           "customer": _cust_brief(o.customer), "paid": t["paid"], "balance_due": t["balance_due"],
           "ordered_cartons": t["ordered_cartons"], "shipped_cartons": t["shipped_cartons"]}
    if brief:
        return out
    items = []
    for it in o.items:
        d = _line(it)
        d["shipped_cartons"] = t["shipped_by_item"].get(it.id, 0)
        d["pending_cartons"] = it.qty_cartons - d["shipped_cartons"]
        items.append(d)
    return _commercial(o) | out | {
        "items": items, "quotation_id": o.quotation_id,
        "quotation_number": o.quotation.number if o.quotation else None,
        "invoiced": t["invoiced"], "unallocated_payments": t["unallocated_payments"],
        "shipments": [shipment(s, brief=True) for s in o.shipments],
        "invoices": [invoice(i, brief=True) for i in o.invoices],
        "payments": [payment(p) for p in o.payments],
    }
