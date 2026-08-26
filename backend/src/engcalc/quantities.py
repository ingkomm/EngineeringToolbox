"""SI quantity catalog. Engineering units live in Python, not in the UI."""

from __future__ import annotations

from typing import TypedDict


class QuantitySpec(TypedDict):
    id: str
    nameKo: str
    nameEn: str
    siUnit: str


QUANTITIES: tuple[QuantitySpec, ...] = (
    {"id": "pressure", "nameKo": "압력", "nameEn": "Pressure", "siUnit": "Pa"},
    {"id": "temperature", "nameKo": "온도", "nameEn": "Temperature", "siUnit": "K"},
    {"id": "enthalpy", "nameKo": "엔탈피", "nameEn": "Specific enthalpy", "siUnit": "J/kg"},
    {"id": "mass_flow", "nameKo": "질량유량", "nameEn": "Mass flow", "siUnit": "kg/s"},
    {"id": "volume_flow", "nameKo": "체적유량", "nameEn": "Volume flow", "siUnit": "m3/s"},
    {"id": "length", "nameKo": "길이", "nameEn": "Length", "siUnit": "m"},
    {"id": "mass", "nameKo": "질량", "nameEn": "Mass", "siUnit": "kg"},
    {"id": "time", "nameKo": "시간", "nameEn": "Time", "siUnit": "s"},
    {"id": "power", "nameKo": "동력", "nameEn": "Power", "siUnit": "W"},
    {"id": "energy", "nameKo": "에너지", "nameEn": "Energy", "siUnit": "J"},
    {"id": "density", "nameKo": "밀도", "nameEn": "Density", "siUnit": "kg/m3"},
    {"id": "area", "nameKo": "면적", "nameEn": "Area", "siUnit": "m2"},
    {"id": "volume", "nameKo": "체적", "nameEn": "Volume", "siUnit": "m3"},
    {"id": "velocity", "nameKo": "속도", "nameEn": "Velocity", "siUnit": "m/s"},
    {"id": "dimensionless", "nameKo": "무차원", "nameEn": "Dimensionless", "siUnit": "1"},
)

QUANTITY_BY_ID: dict[str, QuantitySpec] = {item["id"]: item for item in QUANTITIES}


def si_unit_for(quantity_id: str | None) -> str | None:
    if not quantity_id:
        return None
    spec = QUANTITY_BY_ID.get(quantity_id)
    return spec["siUnit"] if spec else None


def is_known_quantity(quantity_id: str | None) -> bool:
    return quantity_id is None or quantity_id in QUANTITY_BY_ID
