"""Shipment tracking providers.

Today tracking is manual: staff add milestones (packed, sailed, arrived …) and
the buyer sees them as a timeline. To plug in a live container / courier
tracking API later, subclass TrackingProvider, implement fetch_events(), and
register it in PROVIDERS. Set shipment.tracking_provider to its key and the
"Refresh tracking" button will pull events from it.
"""
from dataclasses import dataclass
from datetime import datetime

from ..models import Shipment


@dataclass
class TrackingEvent:
    status: str          # one of models.SHIPMENT_STAGES keys
    location: str
    event_time: datetime
    note: str = ""


class TrackingProvider:
    key = "base"
    label = "Base"

    def fetch_events(self, shipment: Shipment) -> list[TrackingEvent]:
        raise NotImplementedError

    def public_url(self, shipment: Shipment) -> str:
        return shipment.tracking_url or ""


class ManualProvider(TrackingProvider):
    """No external calls — events are entered by staff."""
    key = "manual"
    label = "Manual milestones"

    def fetch_events(self, shipment: Shipment) -> list[TrackingEvent]:
        return []


# Example skeleton for a real provider:
#
# class MyCarrierProvider(TrackingProvider):
#     key = "mycarrier"
#     label = "MyCarrier API"
#     def fetch_events(self, shipment):
#         r = httpx.get(f"https://api.example.com/track/{shipment.container_no}",
#                       headers={"Authorization": f"Bearer {settings.tracking_api_key}"})
#         return [TrackingEvent(status=map_status(e["code"]), location=e["port"],
#                               event_time=parse(e["time"])) for e in r.json()["events"]]

PROVIDERS: dict[str, TrackingProvider] = {p.key: p for p in [ManualProvider()]}


def get_provider(key: str) -> TrackingProvider:
    return PROVIDERS.get(key, PROVIDERS["manual"])
