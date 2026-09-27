"""Database models.

The document chain an export order goes through:

    Enquiry (contact form, anonymous)
    RFQ  ──►  Quotation  ──►  SalesOrder (+ Proforma Invoice no.)
                                  │
                                  ├──► Shipment(s) ──► ShipmentEvent timeline
                                  │        └──► Commercial Invoice + Packing List
                                  └──► Payment(s)  (advance against order, balance against invoice)
"""
from datetime import date, datetime

from sqlalchemy import (JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

Money = Numeric(14, 2, asdecimal=False)
Qty = Numeric(14, 3, asdecimal=False)


def now():
    return datetime.utcnow()


# ---------------------------------------------------------------- people
class Customer(Base):
    """A buyer company (importer / distributor)."""
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(80))
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    tax_id: Mapped[str] = mapped_column(String(80), default="")       # VAT / EIN / TRN
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    default_incoterm: Mapped[str] = mapped_column(String(10), default="FOB")
    default_port: Mapped[str] = mapped_column(String(120), default="")
    payment_terms: Mapped[str] = mapped_column(String(200), default="")
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    users: Mapped[list["User"]] = relationship(back_populates="customer")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(20), default="buyer")   # admin | staff | buyer
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    customer: Mapped[Customer | None] = relationship(back_populates="users")


# ---------------------------------------------------------------- catalogue
class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    short_description: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    features: Mapped[list] = mapped_column(JSON, default=list)
    image_url: Mapped[str] = mapped_column(String(500), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped[Category] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductVariant.id")


class ProductVariant(Base):
    """A sellable SKU — one size of a product, sold by the carton."""
    __tablename__ = "product_variants"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    sku: Mapped[str] = mapped_column(String(60), unique=True)
    size_label: Mapped[str] = mapped_column(String(120))              # e.g. '10" round', '750 ml'
    pcs_per_carton: Mapped[int] = mapped_column(Integer, default=500)
    carton_dims_cm: Mapped[str] = mapped_column(String(60), default="")  # 'L x W x H'
    carton_cbm: Mapped[float] = mapped_column(Qty, default=0)
    net_weight_kg: Mapped[float] = mapped_column(Qty, default=0)      # per carton
    gross_weight_kg: Mapped[float] = mapped_column(Qty, default=0)    # per carton
    cartons_per_20ft: Mapped[int] = mapped_column(Integer, default=0)
    cartons_per_40hc: Mapped[int] = mapped_column(Integer, default=0)
    moq_cartons: Mapped[int] = mapped_column(Integer, default=50)
    list_price: Mapped[float] = mapped_column(Money, default=0)       # per carton, FOB, default currency
    hs_code: Mapped[str] = mapped_column(String(20), default="48236900")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped[Product] = relationship(back_populates="variants")


# ---------------------------------------------------------------- pre-sales
class Enquiry(Base):
    """Anonymous contact-form enquiry from the public site."""
    __tablename__ = "enquiries"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200), default="")
    country: Mapped[str] = mapped_column(String(80), default="")
    product_interest: Mapped[str] = mapped_column(String(120), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="new")    # new | contacted | converted | closed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class RFQ(Base):
    """Request for quotation submitted by a logged-in buyer from the quote basket."""
    __tablename__ = "rfqs"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[str] = mapped_column(String(20), default="submitted")  # submitted | quoted | closed | cancelled
    incoterm: Mapped[str] = mapped_column(String(10), default="FOB")
    destination_port: Mapped[str] = mapped_column(String(120), default="")
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    private_label: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    customer: Mapped[Customer] = relationship()
    items: Mapped[list["RFQItem"]] = relationship(cascade="all, delete-orphan")


class RFQItem(Base):
    __tablename__ = "rfq_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(ForeignKey("rfqs.id"))
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"))
    qty_cartons: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(String(300), default="")

    variant: Mapped[ProductVariant] = relationship()


# ---------------------------------------------------------------- shared line-item columns
class _LineMixin:
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(300))
    sku: Mapped[str] = mapped_column(String(60), default="")
    hs_code: Mapped[str] = mapped_column(String(20), default="")
    pcs_per_carton: Mapped[int] = mapped_column(Integer, default=0)
    qty_cartons: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Money)                 # per carton

    @property
    def amount(self) -> float:
        return round((self.qty_cartons or 0) * (self.unit_price or 0), 2)


class _CommercialMixin:
    """Header fields shared by quotation, order and invoice."""
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    incoterm: Mapped[str] = mapped_column(String(10), default="FOB")
    port_of_loading: Mapped[str] = mapped_column(String(120), default="")
    port_of_discharge: Mapped[str] = mapped_column(String(120), default="")
    payment_terms: Mapped[str] = mapped_column(String(200), default="")
    freight: Mapped[float] = mapped_column(Money, default=0)
    insurance: Mapped[float] = mapped_column(Money, default=0)
    discount: Mapped[float] = mapped_column(Money, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")

    @property
    def subtotal(self) -> float:
        return round(sum(i.amount for i in self.items), 2)

    @property
    def total(self) -> float:
        return round(self.subtotal + (self.freight or 0) + (self.insurance or 0) - (self.discount or 0), 2)


# ---------------------------------------------------------------- quotation
class Quotation(_CommercialMixin, Base):
    __tablename__ = "quotations"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    rfq_id: Mapped[int | None] = mapped_column(ForeignKey("rfqs.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | sent | accepted | rejected | expired
    quote_date: Mapped[date] = mapped_column(Date, default=date.today)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    buyer_response: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    customer: Mapped[Customer] = relationship()
    rfq: Mapped[RFQ | None] = relationship()
    items: Mapped[list["QuotationItem"]] = relationship(cascade="all, delete-orphan")


class QuotationItem(_LineMixin, Base):
    __tablename__ = "quotation_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    quotation_id: Mapped[int] = mapped_column(ForeignKey("quotations.id"))


# ---------------------------------------------------------------- sales order / proforma
class SalesOrder(_CommercialMixin, Base):
    __tablename__ = "sales_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    pi_number: Mapped[str] = mapped_column(String(40), unique=True)    # proforma invoice no.
    quotation_id: Mapped[int | None] = mapped_column(ForeignKey("quotations.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    buyer_po: Mapped[str] = mapped_column(String(80), default="")
    order_date: Mapped[date] = mapped_column(Date, default=date.today)
    expected_ship_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # confirmed | in_production | ready_to_ship | partially_shipped | shipped | delivered | closed | cancelled
    status: Mapped[str] = mapped_column(String(30), default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    customer: Mapped[Customer] = relationship()
    quotation: Mapped[Quotation | None] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan", order_by="OrderItem.id")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="order", order_by="Shipment.id")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="order", order_by="Invoice.id")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", order_by="Payment.id")


class OrderItem(_LineMixin, Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"))

    variant: Mapped[ProductVariant | None] = relationship()


# ---------------------------------------------------------------- shipment
SHIPMENT_STAGES = [
    ("planned", "Booking planned"),
    ("packed", "Goods packed"),
    ("stuffed", "Container stuffed"),
    ("gated_in", "Gated in at port"),
    ("customs_cleared_origin", "Export customs cleared"),
    ("sailed", "Vessel sailed"),
    ("in_transit", "In transit"),
    ("arrived", "Arrived at destination port"),
    ("customs_cleared_dest", "Import customs cleared"),
    ("delivered", "Delivered"),
]


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"))
    mode: Mapped[str] = mapped_column(String(20), default="sea")      # sea | air | courier | road
    container_type: Mapped[str] = mapped_column(String(20), default="20GP")
    carrier: Mapped[str] = mapped_column(String(120), default="")
    forwarder: Mapped[str] = mapped_column(String(120), default="")
    vessel_voyage: Mapped[str] = mapped_column(String(120), default="")
    container_no: Mapped[str] = mapped_column(String(40), default="")
    seal_no: Mapped[str] = mapped_column(String(40), default="")
    bl_awb_no: Mapped[str] = mapped_column(String(60), default="")
    shipping_bill_no: Mapped[str] = mapped_column(String(60), default="")
    port_of_loading: Mapped[str] = mapped_column(String(120), default="")
    port_of_discharge: Mapped[str] = mapped_column(String(120), default="")
    etd: Mapped[date | None] = mapped_column(Date, nullable=True)
    eta: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="planned")
    tracking_provider: Mapped[str] = mapped_column(String(40), default="manual")
    tracking_url: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    order: Mapped[SalesOrder] = relationship(back_populates="shipments")
    items: Mapped[list["ShipmentItem"]] = relationship(cascade="all, delete-orphan")
    events: Mapped[list["ShipmentEvent"]] = relationship(
        cascade="all, delete-orphan", order_by="ShipmentEvent.event_time")


class ShipmentItem(Base):
    """How many cartons of an order line travel in this shipment (supports part shipments)."""
    __tablename__ = "shipment_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"))
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id"))
    qty_cartons: Mapped[int] = mapped_column(Integer)

    order_item: Mapped[OrderItem] = relationship()


class ShipmentEvent(Base):
    __tablename__ = "shipment_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"))
    status: Mapped[str] = mapped_column(String(30))
    location: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    event_time: Mapped[datetime] = mapped_column(DateTime, default=now)
    source: Mapped[str] = mapped_column(String(40), default="manual")  # manual | <provider name>
    created_by: Mapped[str] = mapped_column(String(120), default="")


# ---------------------------------------------------------------- invoice & payment
class Invoice(_CommercialMixin, Base):
    """Commercial (export) invoice — raised per shipment."""
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"))
    shipment_id: Mapped[int | None] = mapped_column(ForeignKey("shipments.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    invoice_date: Mapped[date] = mapped_column(Date, default=date.today)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="issued")  # issued | partially_paid | paid | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    order: Mapped[SalesOrder] = relationship(back_populates="invoices")
    shipment: Mapped[Shipment | None] = relationship()
    customer: Mapped[Customer] = relationship()
    items: Mapped[list["InvoiceItem"]] = relationship(cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")

    @property
    def amount_paid(self) -> float:
        return round(sum(p.amount for p in self.payments), 2)

    @property
    def balance(self) -> float:
        return round(self.total - self.amount_paid, 2)


class InvoiceItem(_LineMixin, Base):
    __tablename__ = "invoice_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    net_weight_kg: Mapped[float] = mapped_column(Qty, default=0)       # line total
    gross_weight_kg: Mapped[float] = mapped_column(Qty, default=0)     # line total
    cbm: Mapped[float] = mapped_column(Qty, default=0)                 # line total


class Payment(Base):
    """Money received. Linked to an order always; to an invoice once allocated.
    Advance payments sit on the order until the invoice is raised."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"))
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    amount: Mapped[float] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    method: Mapped[str] = mapped_column(String(20), default="TT")      # TT | LC | DP | DA | advance | other
    reference: Mapped[str] = mapped_column(String(120), default="")    # SWIFT / UTR / LC no.
    received_on: Mapped[date] = mapped_column(Date, default=date.today)
    inr_amount: Mapped[float] = mapped_column(Money, default=0)        # realised INR (for BRC / FIRC)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    order: Mapped[SalesOrder] = relationship(back_populates="payments")
    invoice: Mapped[Invoice | None] = relationship(back_populates="payments")


# ---------------------------------------------------------------- numbering & audit
class DocSequence(Base):
    __tablename__ = "doc_sequences"
    __table_args__ = (UniqueConstraint("prefix", "fiscal_year"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    prefix: Mapped[str] = mapped_column(String(10))
    fiscal_year: Mapped[str] = mapped_column(String(10))
    last_value: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(Text, default="")
    user_email: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
