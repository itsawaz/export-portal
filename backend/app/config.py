"""Application settings.

Every value can be overridden with an environment variable (or a .env file in
the backend folder). Company details live here so the public site, the PDFs and
the e-mails all read from one place — change them once and the whole app
follows.

For multi-vendor deployments: each vendor runs their own backend instance with
their own .env file. All public-facing copy (hero, about, markets, etc.) is
configurable here, so no code changes are needed between vendors.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_", extra="ignore")

    # --- Infrastructure -------------------------------------------------
    database_url: str = "sqlite:///./export_portal.db"
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    require_buyer_approval: bool = False   # True = admin must approve new buyer accounts

    # --- SMTP (optional; when empty, e-mails are written to the log) ------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # --- Company profile (placeholders — replace with your own) ---------
    company_name: str = "Your Company Exports"
    company_tagline: str = "Compostable Bagasse Tableware — Manufacturer & Exporter"
    company_established: str = "2025"
    company_address: str = "Plot 00, Industrial Area, Your City, State, India - 000000"
    company_city: str = "Your City, India"
    company_email: str = "sales@yourcompany.com"
    company_phone: str = "+91 00000 00000"
    company_gstin: str = "00AAAAA0000A0Z0"
    company_iec: str = "0000000000"
    company_bank_name: str = "Your Bank Ltd."
    company_bank_account: str = "000000000000"
    company_bank_swift: str = "XXXXINBBXXX"
    company_bank_ifsc: str = "XXXX0000000"
    company_bank_branch: str = "Main Branch, Your City"
    default_port_of_loading: str = "Nhava Sheva (INNSA)"
    default_currency: str = "USD"
    default_payment_terms: str = "30% advance by T/T, 70% against copy of B/L"
    quote_validity_days: int = 30

    # --- Portfolio / branding (drives the public-facing site copy) --------
    # A short slug identifying this vendor deployment
    vendor_slug: str = "your-company"
    # Hero section copy
    hero_headline: str = "Compostable tableware, crafted for the world's best tables."
    hero_subtext: str = (
        "We manufacture plates, bowls, clamshells, containers and cutlery from "
        "sugarcane bagasse — plant-based, plastic-free, and built to last through "
        "the busiest service. B2B supply for restaurants, caterers and distributors worldwide."
    )
    # About / story section (use {established} as a placeholder for the year)
    about_text: str = (
        "Founded in {established}, we set out to prove that sustainable packaging "
        "doesn't mean compromising on performance. Our factory uses only clean "
        "bagasse pulp from partner sugar mills — the fibre that remains after "
        "sugar extraction — turning agricultural waste into the kind of tableware "
        "that holds hot curries, salad dressings and everything in between."
    )
    # Singular noun for products in CTAs — e.g. "product", "piece", "style"
    product_noun: str = "product"
    # Label for the primary public enquiry CTA
    inquiry_label: str = "Request a Sample"
    # Comma-separated tags shown as specialty badges in the hero
    specialty_tags: str = "Compostable,Food-safe,Export-ready,Private label"
    # JSON: list of [country_code, country_name, note] for the export markets section
    markets_json: str = (
        '[["AE","United Arab Emirates","Dubai, Abu Dhabi & GCC re-export"],'
        '["US","United States","Food service distributors"],'
        '["GB","United Kingdom","Catering & takeaway wholesale"],'
        '["DE","Germany","EU single-use plastics compliant"],'
        '["IT","Italy","HoReCa & event catering"],'
        '["AU","Australia","Compostable packaging importers"]]'
    )
    # JSON: list of [title, body] for the "Why choose us" section
    why_us_json: str = (
        '[["Made from sugarcane fibre",'
        '"Moulded from bagasse, the fibre left after sugar extraction. No plastic, no wax lining, no styrofoam."],'
        '["Food-safe and tough",'
        '"Handles hot, oily and wet food. Microwave and freezer safe, and holds its shape through delivery."],'
        '["Built for global export",'
        '"Full export paperwork, container loading plans, and online shipment tracking."]]'
    )
    # JSON: list of [title, body] for the "How we produce" section
    process_json: str = (
        '[["Source fibre","Clean bagasse pulp from partner sugar mills, bleached or natural."],'
        '["Mould & press","Hot-press moulding forms each piece to size and trims the edges."],'
        '["Inspect & certify","Every batch is checked for strength, leakage and finish before packing."],'
        '["Pack & ship","Export cartons, palletising on request, and complete shipping documents."]]'
    )
    # JSON: list of [label, value] for key stats shown in the hero
    stats_json: str = (
        '[["Plant-fibre","100% compostable"],'
        '["Certifications","Food-safe & BPA-free"],'
        '["Supply type","B2B · carton & container"],'
        '["Turnaround","Quote within 24 h"]]'
    )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def specialty_list(self) -> list[str]:
        return [t.strip() for t in self.specialty_tags.split(",") if t.strip()]

    def public_profile(self) -> dict:
        import json
        return {
            "name": self.company_name,
            "tagline": self.company_tagline,
            "established": self.company_established,
            "address": self.company_address,
            "city": self.company_city,
            "email": self.company_email,
            "phone": self.company_phone,
            "currency": self.default_currency,
            # Portfolio / branding
            "vendor_slug": self.vendor_slug,
            "hero_headline": self.hero_headline,
            "hero_subtext": self.hero_subtext,
            "about_text": self.about_text.format(established=self.company_established),
            "product_noun": self.product_noun,
            "inquiry_label": self.inquiry_label,
            "specialty_tags": self.specialty_list,
            "markets": json.loads(self.markets_json),
            "why_us": json.loads(self.why_us_json),
            "process": json.loads(self.process_json),
            "stats": json.loads(self.stats_json),
        }


settings = Settings()
