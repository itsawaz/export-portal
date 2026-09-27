# Export Portal: compostable tableware B2B site with order-to-invoice workflow

A public product website plus a buyer portal and back office for an Indian exporter.
It covers the full export order cycle:

```
Enquiry ─┐
Catalogue → Quote basket → RFQ → Quotation → Accept → Sales Order + Proforma Invoice
                                                        │
                            Advance payment (T/T / LC) ─┤
                                                        ├→ Shipment(s) → milestone tracking (buyer + public)
                                                        │      └→ Commercial Invoice + Packing List (PDF)
                                                        └→ Balance payment → order closes automatically
```

**Stack:** Python 3.11+, FastAPI, SQLAlchemy 2, ReportLab (PDFs), JWT auth · React 18, React Router, Vite.
SQLite by default, and PostgreSQL works if you change `APP_DATABASE_URL`.

## Quick start

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # then put in your company details
python -m app.seed --demo                                # sample catalogue, users and one demo order
uvicorn app.main:app --reload --port 8000                # API docs: http://localhost:8000/docs

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                                              # http://localhost:5173 (proxies /api to :8000)
```

Demo logins (delete or change them before going live):

| Role  | E-mail              | Password  |
|-------|---------------------|-----------|
| Admin | admin@example.com   | Admin@123 |
| Staff | staff@example.com   | Staff@123 |
| Buyer | buyer@example.com   | Buyer@123 |

**Production:** run `npm run build` in `frontend/`. FastAPI then serves `frontend/dist` itself, so a single
`uvicorn app.main:app --host 0.0.0.0 --port 8000` (behind nginx/Caddy with HTTPS) runs the whole site.

Tests: `cd backend && pytest -q` walks one order through the whole API, covering part shipments, invoices, payments and the rule that buyers can only see their own data.

## What's where

### Public site (`/`)
Home (hero, why us, categories, how to order, process, export markets, enquiry form) · `/products` catalogue with category filter and search ·
`/products/:slug` sizes and packing table (pcs/carton, carton size, CBM, weights, cartons per 20ft/40HC, MOQ, HS code) ·
`/basket` quote basket with a 20ft/40HC container-fill estimate · `/track` public shipment tracking (needs shipment no. **and** the B/L or container no.) · `/login`, `/register`.
Indicative prices are shown only to signed-in users.

### Buyer portal (`/portal`, role `buyer`)
Overview · RFQs · quotations (accept with PO number, or decline with a reason) · orders (proforma PDF, shipped vs pending, payments) ·
shipments (milestone timeline) · invoices (commercial invoice and packing list PDFs, balance due) · company profile.

### Back office (`/portal`, roles `staff` / `admin`)
Dashboard (pipeline, receivables, overdue, arrivals) · enquiries · RFQ → one-click draft quotation at list prices ·
quotation editor (lines, freight, insurance, discount, validity) · orders (production status, record payments, create full or
part shipments) · shipments (container, seal, B/L, vessel, ETD/ETA, add milestones, which e-mails the buyer) · raise commercial invoice
from a shipment (advance payments are applied automatically, and freight is split pro-rata) · payments (including realised INR for BRC/FIRC) ·
customers · catalogue editor (products, SKUs, packing data, prices) · users (admin only).

### Documents (PDF)
Quotation · Proforma Invoice (with bank details) · Commercial Invoice (LUT export declaration, B/L, container) · Packing List
(carton number ranges, net and gross weight, CBM). The layout is in `backend/app/services/pdfs.py`.

Document numbers follow the Indian financial year, e.g. `QT/2026-27/0001`, `PI/…`, `SO/…`, `SH/…`, `EXP/…`
(`services/numbering.py`).

## Customising

| What | Where |
|---|---|
| Company name, address, GSTIN, IEC, bank, default port and terms | `backend/.env` (see `.env.example`) |
| Home page text, export markets, process steps | `frontend/src/pages/public/Home.jsx` (lists at the top) |
| Colours and fonts | `frontend/src/styles.css` (`:root` tokens) |
| Products and prices | Back office → Catalogue, or `backend/app/seed.py` before first run |
| Product photos | Catalogue → Photo URL. Without a photo, an SVG illustration for the category is shown |
| Shipment stages | `SHIPMENT_STAGES` in `backend/app/models.py` |
| Live container/courier tracking API | Subclass `TrackingProvider` in `backend/app/services/tracking.py`, register it, and set the shipment's `tracking_provider`. The "Refresh tracking" button then pulls events from it |
| E-mail notifications | Set `APP_SMTP_*` in `.env`. Until then, mails are only written to the log |
| Buyer approval before RFQs | `APP_REQUIRE_BUYER_APPROVAL=true` |

**All catalogue prices, weights and container figures in the seed are sample values.** Replace them with your own costing.

## Before going live
- Set a long random `APP_SECRET_KEY`, change or delete the demo users, and set `APP_CORS_ORIGINS` to your domain.
- Use PostgreSQL and add Alembic migrations (the app uses `create_all` on startup, which does not alter existing tables).
- Serve over HTTPS and back up the database.
- Online card payment is deliberately left out. Export orders are paid by T/T or LC against the proforma. A Razorpay or Stripe
  "pay proforma" button can be added to the order page if you need one.

## API
The OpenAPI docs are at `/docs`. The main groups are `/api/auth`, `/api/public`, `/api/rfqs`, `/api/quotations`, `/api/orders`,
`/api/shipments`, `/api/invoices`, `/api/payments` and `/api/admin`.
