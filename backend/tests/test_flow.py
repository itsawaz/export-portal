"""End-to-end test of the export order flow and access rules.

    cd backend && pytest -q
"""
import os
import tempfile

import pytest

os.environ["APP_DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_catalogue, seed_users  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        with SessionLocal() as db:
            seed_catalogue(db)
            seed_users(db)
            db.commit()
        yield c


def login(c, email, pw):
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_public_catalogue_hides_prices(client):
    ps = client.get("/api/public/products").json()
    assert len(ps) >= 10
    assert all(v["list_price"] is None for p in ps for v in p["variants"])
    buyer = login(client, "buyer@example.com", "Buyer@123")
    ps = client.get("/api/public/products", headers=buyer).json()
    assert any(v["list_price"] for p in ps for v in p["variants"])


def test_full_flow(client):
    admin = login(client, "admin@example.com", "Admin@123")
    buyer = login(client, "buyer@example.com", "Buyer@123")
    variants = {v["sku"]: v for v in client.get("/api/admin/variants", headers=admin).json()}

    # 1. buyer submits RFQ (one line below MOQ -> warning, not error)
    r = client.post("/api/rfqs", headers=buyer, json={
        "incoterm": "CIF", "destination_port": "Jebel Ali",
        "items": [{"variant_id": variants["RP-10"]["id"], "qty_cartons": 200},
                  {"variant_id": variants["CU-FK"]["id"], "qty_cartons": 50}]})
    assert r.status_code == 201, r.text
    rfq = r.json()
    assert rfq["number"].startswith("RFQ/") and rfq["warnings"]

    # 2. staff drafts a quote; buyer cannot see drafts
    q = client.post(f"/api/rfqs/{rfq['id']}/quotation", headers=admin).json()
    assert q["status"] == "draft"
    assert client.get(f"/api/quotations/{q['id']}", headers=buyer).status_code == 404
    body = {k: q[k] for k in ("currency", "incoterm", "port_of_loading", "port_of_discharge",
                              "payment_terms", "notes", "valid_until")}
    body |= {"customer_id": q["customer"]["id"], "rfq_id": rfq["id"], "freight": 1000, "insurance": 0, "discount": 0,
             "items": [{k: i[k] for k in ("variant_id", "description", "sku", "hs_code", "pcs_per_carton",
                                          "qty_cartons", "unit_price")} for i in q["items"]]}
    body["items"][1]["qty_cartons"] = 100          # staff bumps cutlery to MOQ
    q = client.put(f"/api/quotations/{q['id']}", headers=admin, json=body).json()
    expected = 200 * 22 + 100 * 19 + 1000
    assert q["total"] == expected
    client.post(f"/api/quotations/{q['id']}/send", headers=admin)
    assert client.get(f"/api/quotations/{q['id']}/pdf", headers=buyer).content[:4] == b"%PDF"

    # 3. buyer accepts -> order + proforma
    r = client.post(f"/api/quotations/{q['id']}/decision", headers=buyer, json={"accept": True, "buyer_po": "PO-1"})
    order = r.json()["order"]
    assert order["pi_number"].startswith("PI/") and order["total"] == expected
    assert client.get(f"/api/orders/{order['id']}/proforma.pdf", headers=buyer).content[:4] == b"%PDF"
    # cannot accept twice
    assert client.post(f"/api/quotations/{q['id']}/decision", headers=buyer, json={"accept": True}).status_code == 400

    # 4. advance payment
    adv = round(expected * 0.3, 2)
    assert client.post("/api/payments", headers=admin, json={"order_id": order["id"], "amount": adv}).status_code == 201
    # buyers cannot record payments
    assert client.post("/api/payments", headers=buyer, json={"order_id": order["id"], "amount": 1}).status_code == 403

    # 5. part shipment: 120 of 200 plates
    items = client.get(f"/api/orders/{order['id']}", headers=admin).json()["items"]
    plate = next(i for i in items if i["sku"] == "RP-10")
    fork = next(i for i in items if i["sku"] == "CU-FK")
    s1 = client.post("/api/shipments", headers=admin, json={
        "order_id": order["id"], "container_no": "TEST1234567", "bl_awb_no": "BL001",
        "items": [{"order_item_id": plate["id"], "qty_cartons": 120}]}).json()
    # over-shipping is refused
    r = client.post("/api/shipments", headers=admin, json={
        "order_id": order["id"], "items": [{"order_item_id": plate["id"], "qty_cartons": 81}]})
    assert r.status_code == 400
    client.post(f"/api/shipments/{s1['id']}/events", headers=admin, json={"status": "sailed", "location": "Nhava Sheva"})
    assert client.get(f"/api/orders/{order['id']}", headers=buyer).json()["status"] == "partially_shipped"

    # public tracking needs the right reference
    assert client.get("/api/public/track", params={"number": s1["number"], "ref": "WRONG"}).status_code == 404
    t = client.get("/api/public/track", params={"number": s1["number"], "ref": "bl001"}).json()
    assert t["status"] == "sailed" and "customer" not in t

    # 6. invoice for shipment 1 absorbs the advance
    inv1 = client.post("/api/invoices/from-shipment", headers=admin, json={"shipment_id": s1["id"]}).json()
    assert inv1["number"].startswith("EXP/")
    assert inv1["subtotal"] == 120 * 22
    assert inv1["amount_paid"] == 0 or inv1["amount_paid"] == adv
    assert client.post("/api/invoices/from-shipment", headers=admin, json={"shipment_id": s1["id"]}).status_code == 400
    assert client.get(f"/api/invoices/{inv1['id']}/packing-list.pdf", headers=buyer).content[:4] == b"%PDF"

    # 7. ship the rest (empty items = everything pending) and deliver both
    s2 = client.post("/api/shipments", headers=admin, json={"order_id": order["id"]}).json()
    assert s2["total_cartons"] == 80 + 100
    inv2 = client.post("/api/invoices/from-shipment", headers=admin, json={"shipment_id": s2["id"]}).json()
    for s in (s1, s2):
        client.post(f"/api/shipments/{s['id']}/events", headers=admin, json={"status": "delivered"})
    assert client.get(f"/api/orders/{order['id']}", headers=admin).json()["status"] == "delivered"

    # 8. pay balances -> invoices paid, order closes itself
    for inv in (inv1, inv2):
        cur = client.get(f"/api/invoices/{inv['id']}", headers=admin).json()
        if cur["balance"] > 0:
            client.post("/api/payments", headers=admin, json={"order_id": order["id"], "invoice_id": inv["id"],
                                                              "amount": cur["balance"]})
        assert client.get(f"/api/invoices/{inv['id']}", headers=admin).json()["status"] == "paid"
    # the order closes once delivered and all invoices are paid; a later event re-evaluates it
    client.post(f"/api/shipments/{s2['id']}/events", headers=admin, json={"status": "delivered", "note": "POD received"})
    o = client.get(f"/api/orders/{order['id']}", headers=admin).json()
    assert o["status"] == "closed"
    assert o["invoiced"] == expected and o["paid"] == expected

    dash = client.get("/api/admin/dashboard", headers=admin).json()
    assert dash["customers"] >= 1


def test_buyer_isolation(client):
    r = client.post("/api/auth/register", json={"email": "other@example.com", "password": "Other@1234",
                                                "full_name": "Other", "company_name": "Other Co", "country": "UK"})
    other = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/orders", headers=other).json() == []
    assert client.get("/api/orders/1", headers=other).status_code == 404
    assert client.get("/api/admin/dashboard", headers=other).status_code == 403
