"""Seed the database with a sample catalogue and demo accounts.

    python -m app.seed            # catalogue + users
    python -m app.seed --demo     # ...plus one order taken all the way through the flow
    python -m app.seed --reset    # drop everything first

All prices, weights and packing figures are SAMPLE values — replace them with
your own costing before going live.
"""
import sys

from sqlalchemy import select

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import Category, Customer, Product, ProductVariant, User

# (category, slug, description)
CATEGORIES = [
    ("Plates", "plates", "Round and square dinner, dessert and serving plates."),
    ("Compartment Plates & Trays", "compartment-plates", "3 to 6-compartment plates and meal trays."),
    ("Clamshells & Boxes", "clamshells", "Hinged clamshell containers and burger boxes for takeaway."),
    ("Bowls & Soup Cups", "bowls", "Round bowls and soup cups from 120 ml to 1000 ml, with lids."),
    ("Food Containers", "containers", "Rectangular container trays with lids for delivery."),
    ("Cutlery", "cutlery", "Compostable forks, spoons and knives."),
]

# product: (category_slug, name, slug, short, features, [variants])
# variant: (sku, size, pcs/ctn, dims, cbm, net kg, gross kg, ctn/20ft, ctn/40hc, moq, price)
PRODUCTS = [
    ("plates", "Round Bagasse Plate", "round-plate",
     "Classic round plates with a smooth, food-grade finish for restaurants, hotels and events.",
     ["Microwave & freezer safe", "Oil and water resistant", "Hot food up to 100 °C", "Home & industrial compostable"],
     [("RP-06", '6" round', 1000, "32x16x33", 0.017, 5.0, 5.6, 1550, 3700, 100, 14.50),
      ("RP-07", '7" round', 1000, "37x19x36", 0.025, 6.5, 7.2, 1080, 2600, 100, 18.00),
      ("RP-09", '9" round', 500, "47x23x25", 0.027, 6.0, 6.7, 1000, 2400, 100, 17.50),
      ("RP-10", '10" round', 500, "52x26x27", 0.037, 8.0, 8.8, 740, 1780, 100, 22.00)]),
    ("plates", "Square Bagasse Plate", "square-plate",
     "Square plates for plated desserts, snacks and modern presentation.",
     ["Rigid rim", "Stackable", "Cut-resistant surface"],
     [("SP-06", '6" square', 1000, "33x16x33", 0.017, 5.2, 5.8, 1550, 3700, 100, 15.00),
      ("SP-10", '10" square', 500, "53x27x27", 0.039, 8.5, 9.3, 700, 1700, 100, 23.50)]),
    ("compartment-plates", "Compartment Plate", "compartment-plate",
     "Multi-compartment plates that keep dishes separate for catering, meal prep and delivery.",
     ["Deep dividers", "Leak resistant", "Ideal for thali and combo meals"],
     [("CP-3-10", '3-compartment 10"', 500, "53x27x30", 0.043, 9.0, 9.8, 640, 1540, 100, 24.00),
      ("CP-4-11", '4-compartment 11"', 500, "58x29x31", 0.052, 10.5, 11.4, 530, 1270, 100, 28.00),
      ("CP-5-12", '5-compartment 12"', 400, "62x31x30", 0.058, 11.0, 11.9, 480, 1140, 100, 30.50),
      ("CP-6-13", '6-compartment 13"', 300, "66x33x30", 0.065, 11.5, 12.4, 430, 1020, 100, 31.00)]),
    ("compartment-plates", "Meal Tray", "meal-tray",
     "Hollow meal trays for cafeterias, canteens, airlines and large-scale food service.",
     ["Rectangular footprint", "Fits standard lids", "Stacks tightly"],
     [("MT-5C", "5-compartment tray", 400, "60x32x32", 0.061, 11.2, 12.1, 450, 1080, 100, 29.00)]),
    ("clamshells", "Clamshell Container", "clamshell",
     "Hinged clamshells with a secure lock for takeaway meals.",
     ["Secure locking tab", "Grease resistant", "Vent holes against sogginess"],
     [("CL-66", '6x6"', 500, "50x33x30", 0.050, 8.5, 9.3, 560, 1340, 100, 26.00),
      ("CL-88", '8x8"', 250, "42x42x32", 0.056, 8.8, 9.6, 500, 1200, 100, 27.50),
      ("CL-99", '9x9"', 200, "47x47x31", 0.068, 9.0, 9.9, 410, 990, 100, 29.00),
      ("CL-993C", '9x9" 3-compartment', 200, "47x47x31", 0.068, 9.2, 10.1, 410, 990, 100, 30.00)]),
    ("clamshells", "Burger Box", "burger-box",
     "Clamshell burger box — sturdy, leak-resistant and good for hot or cold burgers.",
     ["Tall dome lid", "Keeps buns intact", "Custom embossing available"],
     [("BB-6", '6" burger box', 500, "52x32x34", 0.057, 8.0, 8.8, 490, 1180, 100, 25.00)]),
    ("bowls", "Round Bowl", "round-bowl",
     "Eco-friendly bowls for soups, curries, salads and desserts.",
     ["Heat tolerant", "Oil repellent", "Matching PP or bagasse lids"],
     [("RB-120", "120 ml", 2000, "40x22x32", 0.028, 5.5, 6.2, 960, 2300, 100, 16.00),
      ("RB-240", "240 ml", 1000, "44x24x34", 0.036, 6.0, 6.7, 750, 1800, 100, 17.00),
      ("RB-500", "500 ml", 1000, "52x28x36", 0.052, 9.5, 10.4, 520, 1250, 100, 26.00),
      ("RB-1000", "1000 ml", 500, "56x30x38", 0.064, 10.0, 10.9, 420, 1000, 100, 29.50)]),
    ("bowls", "Soup Cup with Lid", "soup-cup",
     "Deep soup cups with a smooth, food-safe finish for hot liquids.",
     ["Tight-fitting lid", "Double-wall feel", "Microwave safe"],
     [("SC-350", "350 ml with lid", 500, "46x24x40", 0.044, 7.0, 7.7, 610, 1470, 100, 27.00),
      ("SC-500", "500 ml with lid", 500, "50x26x42", 0.055, 8.0, 8.8, 490, 1180, 100, 31.00)]),
    ("containers", "Container Tray with Lid", "container-tray",
     "Rectangular container trays with tight lids for residue-free delivery.",
     ["Snap-fit lid", "Stackable in delivery bags", "Freezer safe"],
     [("CT-500", "500 ml with lid", 500, "48x30x36", 0.052, 8.5, 9.3, 520, 1250, 100, 30.00),
      ("CT-750", "750 ml with lid", 500, "52x33x38", 0.065, 9.5, 10.4, 420, 1000, 100, 34.00)]),
    ("cutlery", "Cutlery Set", "cutlery",
     "Forks, spoons and knives that pair with the full tableware range.",
     ["Sturdy for hot food", "Smooth edges", "Individually wrapped option"],
     [("CU-FK", "Fork 6.5\"", 2000, "40x30x25", 0.030, 6.0, 6.6, 900, 2150, 100, 19.00),
      ("CU-SP", "Spoon 6.5\"", 2000, "40x30x25", 0.030, 6.0, 6.6, 900, 2150, 100, 19.00),
      ("CU-KN", "Knife 6.5\"", 2000, "40x30x25", 0.030, 6.0, 6.6, 900, 2150, 100, 19.00)]),
]

USERS = [
    ("admin@example.com", "Admin@123", "Admin User", "admin"),
    ("staff@example.com", "Staff@123", "Export Executive", "staff"),
]


def seed_catalogue(db):
    if db.scalar(select(Category)):
        print("Catalogue already present — skipped")
        return
    cats = {}
    for i, (name, slug, desc) in enumerate(CATEGORIES):
        cats[slug] = Category(name=name, slug=slug, description=desc, sort_order=i)
        db.add(cats[slug])
    for i, (cslug, name, slug, short, feats, variants) in enumerate(PRODUCTS):
        p = Product(category=cats[cslug], name=name, slug=slug, short_description=short,
                    description=short + " Moulded from 100% sugarcane bagasse fibre. PFAS-free options on request.",
                    features=feats, sort_order=i)
        for (sku, size, pcs, dims, cbm, nw, gw, c20, c40, moq, price) in variants:
            p.variants.append(ProductVariant(sku=sku, size_label=size, pcs_per_carton=pcs, carton_dims_cm=dims,
                                             carton_cbm=cbm, net_weight_kg=nw, gross_weight_kg=gw,
                                             cartons_per_20ft=c20, cartons_per_40hc=c40, moq_cartons=moq,
                                             list_price=price))
        db.add(p)
    print(f"Seeded {len(CATEGORIES)} categories, {len(PRODUCTS)} products")


def seed_users(db):
    for email, pw, name, role in USERS:
        if not db.scalar(select(User).where(User.email == email)):
            db.add(User(email=email, password_hash=hash_password(pw), full_name=name, role=role))
    if not db.scalar(select(User).where(User.email == "buyer@example.com")):
        c = Customer(company_name="Demo Foods Trading LLC", country="United Arab Emirates", contact_name="Sam Buyer",
                     email="buyer@example.com", phone="+971 4 000 0000",
                     address="Warehouse 12, Al Quoz Industrial Area\nDubai", tax_id="TRN 100000000000003",
                     default_incoterm="CIF", default_port="Jebel Ali (AEJEA)",
                     payment_terms="30% advance by T/T, 70% against copy of B/L")
        db.add(c)
        db.flush()
        db.add(User(email="buyer@example.com", password_hash=hash_password("Buyer@123"),
                    full_name="Sam Buyer", role="buyer", customer_id=c.id))
    print("Users: admin@example.com / Admin@123 · staff@example.com / Staff@123 · buyer@example.com / Buyer@123")


def seed_demo_flow():
    """Walk one order through the whole API: RFQ → quote → order → advance → shipment → invoice."""
    from datetime import date, timedelta

    from fastapi.testclient import TestClient

    from .main import app

    with TestClient(app) as c:
        def login(email, pw):
            r = c.post("/api/auth/login", json={"email": email, "password": pw})
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        admin, buyer = login("admin@example.com", "Admin@123"), login("buyer@example.com", "Buyer@123")
        if c.get("/api/orders", headers=admin).json():
            print("Demo orders already present — skipped")
            return
        variants = {v["sku"]: v["id"] for v in c.get("/api/admin/variants", headers=admin).json()}
        rfq = c.post("/api/rfqs", headers=buyer, json={
            "incoterm": "CIF", "destination_port": "Jebel Ali (AEJEA)", "notes": "First trial order",
            "items": [{"variant_id": variants["RP-10"], "qty_cartons": 300},
                      {"variant_id": variants["CL-99"], "qty_cartons": 200},
                      {"variant_id": variants["RB-500"], "qty_cartons": 150}]}).json()
        q = c.post(f"/api/rfqs/{rfq['id']}/quotation", headers=admin).json()
        body = {k: q[k] for k in ("currency", "incoterm", "port_of_loading", "port_of_discharge",
                                  "payment_terms", "notes", "valid_until")}
        body |= {"customer_id": q["customer"]["id"], "rfq_id": rfq["id"], "freight": 1450, "insurance": 60,
                 "discount": 0, "items": [{k: i[k] for k in ("variant_id", "description", "sku", "hs_code",
                                                              "pcs_per_carton", "qty_cartons", "unit_price")}
                                          for i in q["items"]]}
        c.put(f"/api/quotations/{q['id']}", headers=admin, json=body)
        c.post(f"/api/quotations/{q['id']}/send", headers=admin)
        order = c.post(f"/api/quotations/{q['id']}/decision", headers=buyer,
                       json={"accept": True, "buyer_po": "DF-PO-2026-014"}).json()["order"]
        c.post("/api/payments", headers=admin, json={"order_id": order["id"], "amount": round(order["total"] * 0.3, 2),
                                                     "method": "TT", "reference": "SWIFT-ADV-0001"})
        c.post(f"/api/orders/{order['id']}/status", headers=admin, json={"status": "in_production"})
        sh = c.post("/api/shipments", headers=admin, json={
            "order_id": order["id"], "carrier": "Sample Line", "vessel_voyage": "MV SAMPLE STAR / 026W",
            "container_no": "ABCU1234567", "seal_no": "SL998877", "bl_awb_no": "SMPL26000123",
            "container_type": "20GP", "etd": str(date.today()), "eta": str(date.today() + timedelta(days=9))}).json()
        for st, loc in [("packed", "Factory"), ("stuffed", "Factory"), ("gated_in", "Nhava Sheva"),
                        ("customs_cleared_origin", "Nhava Sheva"), ("sailed", "Nhava Sheva")]:
            c.post(f"/api/shipments/{sh['id']}/events", headers=admin, json={"status": st, "location": loc})
        c.post("/api/invoices/from-shipment", headers=admin, json={"shipment_id": sh["id"]})
        # a second RFQ left open so the admin inbox has something in it
        c.post("/api/rfqs", headers=buyer, json={"incoterm": "CIF", "destination_port": "Jebel Ali (AEJEA)",
                                                 "items": [{"variant_id": variants["CT-750"], "qty_cartons": 400}]})
        c.post("/api/public/enquiries", json={"full_name": "Maria Rossi", "email": "maria@example.it",
                                              "company": "Rossi Catering", "country": "Italy",
                                              "product_interest": "Compartment Plates",
                                              "message": "Looking for a 40HC mixed container, private label."})
        print("Demo flow created: 1 order shipped + invoiced, 1 open RFQ, 1 enquiry")


def main():
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_catalogue(db)
        seed_users(db)
        db.commit()
    if "--demo" in sys.argv:
        seed_demo_flow()


if __name__ == "__main__":
    main()
