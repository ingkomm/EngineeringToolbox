"""Pydantic models matching shared/schema/project.schema.json."""

from __future__ import annotations

import re
from typing import Annotated, Literal, TypeGuard, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

VariableStatus = Literal["idle", "ok", "mapped", "error"]
RelationType = Literal["value_flow", "reference", "association", "pipe", "signal"]
ObjectKind = Literal["calculation", "equipment", "point", "memo"]

VARIABLE_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
OBJECT_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


class Size(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: float
    height: float


class InputVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None

    @model_validator(mode="after")
    def default_name(self) -> InputVariable:
        if not self.name.strip():
            self.name = self.id
        return self


class FormulaVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    formula: str = ""
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None

    @model_validator(mode="after")
    def default_name(self) -> FormulaVariable:
        if not self.name.strip():
            self.name = self.id
        return self


class OutputBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    sourceVariableId: str
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None

    @model_validator(mode="after")
    def default_name(self) -> OutputBinding:
        if not self.name.strip():
            self.name = self.id
        return self


class CalculationObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["calculation"] = "calculation"
    id: str
    name: str
    position: Position
    inputs: list[InputVariable] = Field(default_factory=list)
    calculations: list[FormulaVariable] = Field(default_factory=list)
    outputs: list[OutputBinding] = Field(default_factory=list)
    links: list[CalculationLink] = Field(default_factory=list)
    objectLinkSide: Literal["top", "bottom"] = "top"
    width: float | None = Field(default=None, ge=280)


class CalculationLink(BaseModel):
    """Dashed association from a Calculation Object to a Point or Equipment."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    targetObjectId: str | None = None
    targetPortId: str | None = None

    @model_validator(mode="after")
    def default_name(self) -> CalculationLink:
        if not self.name.strip():
            self.name = self.id
        return self


class PointEnd(BaseModel):
    """A Point connection to an Equipment port or another Point connection."""

    model_config = ConfigDict(extra="forbid")

    objectId: str
    portId: str
    reversed: bool = False
    linkKind: Literal["pipe", "signal"] = "pipe"
    showArrow: bool = False
    waypoints: list[Position] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_equipment_id(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if "objectId" not in payload and payload.get("equipmentId"):
            payload["objectId"] = payload["equipmentId"]
        payload.pop("equipmentId", None)
        return payload


class SymbolLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["line"]
    id: str = ""
    x1: float
    y1: float
    x2: float
    y2: float


class SymbolCircle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["circle"]
    id: str = ""
    cx: float
    cy: float
    r: float = Field(ge=0)


class SymbolPolygon(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["polygon"]
    id: str = ""
    points: list[Position]


class SymbolPort(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    x: float | None = None
    y: float | None = None
    side: Literal["left", "right", "top", "bottom"] | None = None
    offset: float | None = None


class SymbolDrawing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    width: float = Field(ge=22)
    height: float = Field(ge=22)
    primitives: list[SymbolLine | SymbolCircle | SymbolPolygon] = Field(default_factory=list)
    ports: list[SymbolPort] = Field(default_factory=list)


class EquipmentObject(BaseModel):
    """Worksheet equipment. Port identities are IN_1..IN_n and OUT_1..OUT_n from the counts."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["equipment"] = "equipment"
    id: str
    name: str = ""
    position: Position
    symbolId: str = "generic-equipment"
    inCount: int = Field(default=1, ge=0, le=8)
    outCount: int = Field(default=1, ge=0, le=8)
    objectLinkSide: Literal["top", "bottom"] = "top"
    tag: str = ""
    rotation: Literal[0, 90, 180, 270] = 0
    width: float | None = Field(default=None, ge=22)
    height: float | None = Field(default=None, ge=22)
    drawing: SymbolDrawing | None = None

    @model_validator(mode="after")
    def default_name(self) -> EquipmentObject:
        if not self.name.strip():
            self.name = self.id
        return self


class PointObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["point"] = "point"
    id: str
    name: str = ""
    position: Position
    connectionCount: int = Field(default=4, ge=2, le=4)
    connections: list[PointEnd | None] = Field(default_factory=list)
    objectLinkSide: Literal["top", "bottom"] = "top"

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_ends(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        legacy_a = payload.pop("a", None)
        legacy_b = payload.pop("b", None)
        if "connections" not in payload and (legacy_a is not None or legacy_b is not None):
            payload["connections"] = [legacy_a, legacy_b]
            payload.setdefault("connectionCount", 4)
        return payload

    @model_validator(mode="after")
    def default_name_and_pad(self) -> PointObject:
        if not self.name.strip():
            self.name = self.id
        self.connectionCount = 4
        padded = list(self.connections)
        while len(padded) < 4:
            padded.append(None)
        self.connections = padded[:4]
        return self


class SimpleTable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    cells: list[list[str | float | int | None]] = Field(default_factory=list)


class MemoLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    memoId: str
    targetObjectId: str


class MemoObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["memo"]
    id: str
    title: str = ""
    content: str = ""
    tables: list[SimpleTable] = Field(default_factory=list)
    links: list[MemoLink] = Field(default_factory=list)
    position: Position
    size: Size = Field(default_factory=lambda: Size(width=200, height=140))


OBJECT_LINK_HANDLE = "OBJ"
POINT_CONNECTION_IDS = ("C_1", "C_2", "C_3", "C_4")


def equipment_port_ids(equipment: EquipmentObject) -> set[str]:
    ins = {f"IN_{index}" for index in range(1, equipment.inCount + 1)}
    outs = {f"OUT_{index}" for index in range(1, equipment.outCount + 1)}
    return ins | outs


def point_port_ids(point: PointObject) -> set[str]:
    return {point.id, OBJECT_LINK_HANDLE, *POINT_CONNECTION_IDS}


def layout_port_ids(obj: EquipmentObject | PointObject) -> set[str]:
    if is_equipment_object(obj):
        return {obj.id, OBJECT_LINK_HANDLE, *equipment_port_ids(obj)}
    return point_port_ids(obj)


def _explode_legacy_arrangement(item: dict) -> list[dict]:
    origin = item.get("position") or {"x": 0, "y": 0}
    domain = item.get("domain") or {}
    view = item.get("view") or {}
    elements = view.get("elements") or {}
    exploded: list[dict] = []
    for equipment in domain.get("equipment") or []:
        if not isinstance(equipment, dict):
            continue
        element = elements.get(equipment.get("id"), {}) if isinstance(elements, dict) else {}
        exploded.append(
            {
                "kind": "equipment",
                "id": equipment.get("id"),
                "name": equipment.get("name") or equipment.get("id"),
                "position": {
                    "x": float(origin.get("x", 0)) + float(element.get("x", 0) or 0),
                    "y": float(origin.get("y", 0)) + float(element.get("y", 0) or 0),
                },
                "symbolId": equipment.get("symbolId") or "generic-equipment",
                "inCount": equipment.get("inCount", 1),
                "outCount": equipment.get("outCount", 1),
            }
        )
    for point in domain.get("points") or []:
        if not isinstance(point, dict):
            continue
        element = elements.get(point.get("id"), {}) if isinstance(elements, dict) else {}
        payload = dict(point)
        payload["kind"] = "point"
        payload["position"] = {
            "x": float(origin.get("x", 0)) + float(element.get("x", 0) or 0),
            "y": float(origin.get("y", 0)) + float(element.get("y", 0) or 0),
        }
        exploded.append(payload)
    return exploded


WorksheetObject = Annotated[Union[CalculationObject, EquipmentObject, PointObject, MemoObject], Field(discriminator="kind")]


class Edge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    sourceObjectId: str
    sourceVariableId: str
    targetObjectId: str
    targetVariableId: str
    enabled: bool = True
    collapsed: bool = False
    relationType: RelationType = "value_flow"


def is_calculation_object(
    obj: CalculationObject | EquipmentObject | PointObject | MemoObject,
) -> TypeGuard[CalculationObject]:
    return getattr(obj, "kind", "calculation") == "calculation"


def is_equipment_object(
    obj: CalculationObject | EquipmentObject | PointObject | MemoObject,
) -> TypeGuard[EquipmentObject]:
    return getattr(obj, "kind", None) == "equipment"


def is_point_object(
    obj: CalculationObject | EquipmentObject | PointObject | MemoObject,
) -> TypeGuard[PointObject]:
    return getattr(obj, "kind", None) == "point"


def is_memo_object(
    obj: CalculationObject | EquipmentObject | PointObject | MemoObject,
) -> TypeGuard[MemoObject]:
    return getattr(obj, "kind", None) == "memo"


def is_layout_object(
    obj: CalculationObject | EquipmentObject | PointObject | MemoObject,
) -> TypeGuard[EquipmentObject | PointObject]:
    return is_equipment_object(obj) or is_point_object(obj)


def is_value_flow_edge(edge: Edge) -> bool:
    return (edge.relationType or "value_flow") == "value_flow"


class LibrarySymbol(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    kind: Literal["equipment", "point"] = "equipment"
    inCount: int | None = Field(default=None, ge=0, le=8)
    outCount: int | None = Field(default=None, ge=0, le=8)
    drawing: SymbolDrawing | None = None
    category: str | None = None


class ProjectDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    objects: list[CalculationObject | EquipmentObject | PointObject | MemoObject] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    symbolLibrary: list[LibrarySymbol] = Field(default_factory=list)
    symbolCategories: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def tag_and_explode(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        objects = data.get("objects")
        if not isinstance(objects, list):
            return data
        tagged: list[object] = []
        for item in objects:
            if not isinstance(item, dict):
                tagged.append(item)
                continue
            kind = item.get("kind")
            if kind is None:
                kind = "arrangement" if "domain" in item else "calculation"
                item = {**item, "kind": kind}
            if kind == "arrangement" or "domain" in item and kind not in {"calculation", "equipment", "point", "memo"}:
                tagged.extend(_explode_legacy_arrangement(item))
            else:
                tagged.append(item)
        return {**data, "objects": tagged}

    @model_validator(mode="after")
    def validate_layout_refs(self) -> ProjectDocument:
        seen: set[str] = set()
        for item in self.objects:
            if item.id in seen:
                raise ValueError(f"DUPLICATE_OBJECT_ID: {item.id}")
            seen.add(item.id)
        hosts = {item.id: item for item in self.objects if is_layout_object(item)}
        for item in self.objects:
            if is_calculation_object(item):
                for link in item.links:
                    if link.targetObjectId and link.targetObjectId in hosts:
                        link.targetPortId = OBJECT_LINK_HANDLE
            if not is_point_object(item):
                continue
            for index, end in enumerate(item.connections):
                if end is None:
                    continue
                host = hosts.get(end.objectId)
                if host is None:
                    raise ValueError(f"UNKNOWN_ELEMENT: point {item.id} end {end.objectId}")
                if end.portId == OBJECT_LINK_HANDLE or end.portId not in layout_port_ids(host):
                    raise ValueError(f"UNKNOWN_POINT: point {item.id} port {end.portId}")
                if end.objectId == item.id:
                    raise ValueError(f"SELF_POINT_LINK: {item.id} {end.portId}")
        for memo in self.objects:
            if not is_memo_object(memo):
                continue
            for link in memo.links:
                if link.memoId != memo.id:
                    raise ValueError(f"MEMO_LINK_SOURCE: {link.id}")
                if link.targetObjectId not in seen or link.targetObjectId == memo.id:
                    raise ValueError(f"UNKNOWN_MEMO_LINK_TARGET: {link.targetObjectId}")
        for edge in self.edges:
            if edge.relationType != "association":
                continue
            if edge.targetObjectId in hosts:
                edge.targetVariableId = OBJECT_LINK_HANDLE
            if edge.sourceObjectId in hosts and edge.sourceVariableId not in layout_port_ids(hosts[edge.sourceObjectId]):
                edge.sourceVariableId = OBJECT_LINK_HANDLE
        return self


class EvalError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objectId: str | None = None
    variableId: str | None = None
    code: str
    message: str


class EvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectDocument
    dirtyObjectIds: list[str] | None = None


class EvaluateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectDocument
    evaluatedObjectIds: list[str]
    errors: list[EvalError] = Field(default_factory=list)
