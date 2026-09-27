"""Request bodies (input validation)."""
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


# ---------------- auth
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    company_name: str
    country: str
    phone: str = ""
    address: str = ""
    tax_id: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    tax_id: str | None = None
    default_port: str | None = None


# ---------------- public
class EnquiryIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    company: str = ""
    country: str = ""
    product_interest: str = ""
    message: str = Field("", max_length=1000)


# ---------------- catalogue admin
class VariantIn(BaseModel):
    id: int | None = None
    sku: str
    size_label: str
    pcs_per_carton: int = 500
    carton_dims_cm: str = ""
    carton_cbm: float = 0
    net_weight_kg: float = 0
    gross_weight_kg: float = 0
    cartons_per_20ft: int = 0
    cartons_per_40hc: int = 0
    moq_cartons: int = 50
    list_price: float = 0
    hs_code: str = "48236900"
    is_active: bool = True


class ProductIn(BaseModel):
    category_id: int
    name: str
    slug: str
    short_description: str = ""
    description: str = ""
    features: list[str] = []
    image_url: str = ""
    is_active: bool = True
    sort_order: int = 0
    variants: list[VariantIn] = []


class CategoryIn(BaseModel):
    name: str
    slug: str
    description: str = ""
    sort_order: int = 0


# ---------------- RFQ
class RFQItemIn(BaseModel):
    variant_id: int
    qty_cartons: int = Field(gt=0)
    notes: str = ""


class RFQIn(BaseModel):
    items: list[RFQItemIn] = Field(min_length=1)
    incoterm: str = "FOB"
    destination_port: str = ""
    target_date: date | None = None
    private_label: bool = False
    notes: str = ""


# ---------------- quotation / order / invoice lines
class LineIn(BaseModel):
    variant_id: int | None = None
    description: str
    sku: str = ""
    hs_code: str = ""
    pcs_per_carton: int = 0
    qty_cartons: int = Field(gt=0)
    unit_price: float = Field(ge=0)


class CommercialIn(BaseModel):
    currency: str = "USD"
    incoterm: str = "FOB"
    port_of_loading: str = ""
    port_of_discharge: str = ""
    payment_terms: str = ""
    freight: float = 0
    insurance: float = 0
    discount: float = 0
    notes: str = ""
    items: list[LineIn] = Field(min_length=1)


class QuotationIn(CommercialIn):
    customer_id: int
    rfq_id: int | None = None
    valid_until: date | None = None


class QuoteDecisionIn(BaseModel):
    accept: bool
    buyer_po: str = ""
    response: str = ""


class OrderStatusIn(BaseModel):
    status: str
    expected_ship_date: date | None = None


# ---------------- shipment
class ShipmentItemIn(BaseModel):
    order_item_id: int
    qty_cartons: int = Field(gt=0)


class ShipmentIn(BaseModel):
    order_id: int
    mode: str = "sea"
    container_type: str = "20GP"
    carrier: str = ""
    forwarder: str = ""
    vessel_voyage: str = ""
    container_no: str = ""
    seal_no: str = ""
    bl_awb_no: str = ""
    shipping_bill_no: str = ""
    port_of_loading: str = ""
    port_of_discharge: str = ""
    etd: date | None = None
    eta: date | None = None
    tracking_provider: str = "manual"
    tracking_url: str = ""
    items: list[ShipmentItemIn] = []   # empty = ship everything still pending


class ShipmentUpdateIn(BaseModel):
    mode: str | None = None
    container_type: str | None = None
    carrier: str | None = None
    forwarder: str | None = None
    vessel_voyage: str | None = None
    container_no: str | None = None
    seal_no: str | None = None
    bl_awb_no: str | None = None
    shipping_bill_no: str | None = None
    port_of_loading: str | None = None
    port_of_discharge: str | None = None
    etd: date | None = None
    eta: date | None = None
    tracking_provider: str | None = None
    tracking_url: str | None = None


class ShipmentEventIn(BaseModel):
    status: str
    location: str = ""
    note: str = ""
    event_time: datetime | None = None


# ---------------- invoice & payment
class InvoiceFromShipmentIn(BaseModel):
    shipment_id: int
    invoice_date: date | None = None
    due_days: int = 30
    freight: float | None = None       # default: pro-rata share of order freight
    insurance: float | None = None
    allocate_advance: bool = True     # apply unallocated advance payments to this invoice


class PaymentIn(BaseModel):
    order_id: int
    invoice_id: int | None = None
    amount: float = Field(gt=0)
    currency: str = "USD"
    method: str = "TT"
    reference: str = ""
    received_on: date | None = None
    inr_amount: float = 0
    notes: str = ""


class CustomerIn(BaseModel):
    company_name: str
    country: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    tax_id: str = ""
    currency: str = "USD"
    default_incoterm: str = "FOB"
    default_port: str = ""
    payment_terms: str = ""
    is_approved: bool = True


class StatusIn(BaseModel):
    status: str
