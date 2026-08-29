"""Pydantic models matching shared/schema/project.schema.json."""

from __future__ import annotations

import re
from typing import Annotated, Literal, TypeGuard, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

VariableStatus = Literal["idle", "ok", "mapped", "error"]
RelationType = Literal["value_flow", "reference", "association"]
ObjectKind = Literal["calculation", "arrangement"]

VARIABLE_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
OBJECT_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


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


class ArrangementEquipment(BaseModel):
    """Placed equipment. Port identities are IN_1..IN_n and OUT_1..OUT_n from the counts."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    symbolId: str = "generic-equipment"
    inCount: int = Field(default=1, ge=0, le=8)
    outCount: int = Field(default=1, ge=0, le=8)

    @model_validator(mode="after")
    def default_name(self) -> ArrangementEquipment:
        if not self.name.strip():
            self.name = self.id
        return self


class PointEnd(BaseModel):
    """One end of a Point, attached to an equipment In or Out port."""

    model_config = ConfigDict(extra="forbid")

    equipmentId: str
    portId: str


class ArrangementPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    a: PointEnd | None = None
    b: PointEnd | None = None

    @model_validator(mode="after")
    def default_name(self) -> ArrangementPoint:
        if not self.name.strip():
            self.name = self.id
        return self


class ArrangementDomain(BaseModel):
    """Engineering-meaningful identities and connections. Independent of canvas coordinates."""

    model_config = ConfigDict(extra="forbid")

    equipment: list[ArrangementEquipment] = Field(default_factory=list)
    points: list[ArrangementPoint] = Field(default_factory=list)


def equipment_port_ids(equipment: ArrangementEquipment) -> set[str]:
    ins = {f"IN_{index}" for index in range(1, equipment.inCount + 1)}
    outs = {f"OUT_{index}" for index in range(1, equipment.outCount + 1)}
    return ins | outs


class ElementView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float
    width: float = 96
    height: float = 64
    rotation: float = 0
    zIndex: int = 0
    visible: bool = True


class ArrangementView(BaseModel):
    """Worksheet-local drawing state. Moving elements here is not a domain change."""

    model_config = ConfigDict(extra="forbid")

    width: float = 720
    height: float = 400
    rotation: float = 0
    zIndex: int = 0
    elements: dict[str, ElementView] = Field(default_factory=dict)


class ArrangementObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["arrangement"] = "arrangement"
    id: str
    name: str
    position: Position
    domain: ArrangementDomain = Field(default_factory=ArrangementDomain)
    view: ArrangementView = Field(default_factory=ArrangementView)

    @model_validator(mode="after")
    def validate_referential_integrity(self) -> ArrangementObject:
        claimed: dict[str, str] = {}

        def claim(item_id: str, kind: str) -> None:
            if not VARIABLE_ID_RE.match(item_id):
                raise ValueError(f"INVALID_ELEMENT_ID: {item_id}")
            previous = claimed.get(item_id)
            if previous:
                code = "DUPLICATE_POINT_ID" if kind == "point" or previous == "point" else "DUPLICATE_ELEMENT_ID"
                raise ValueError(f"{code}: {item_id}")
            claimed[item_id] = kind

        for item in self.domain.equipment:
            claim(item.id, "equipment")
        for item in self.domain.points:
            claim(item.id, "point")

        equipment_by_id = {item.id: item for item in self.domain.equipment}
        for point in self.domain.points:
            for end in (point.a, point.b):
                if end is None:
                    continue
                host = equipment_by_id.get(end.equipmentId)
                if host is None:
                    raise ValueError(f"UNKNOWN_ELEMENT: point {point.id} end {end.equipmentId}")
                if end.portId not in equipment_port_ids(host):
                    raise ValueError(f"UNKNOWN_POINT: point {point.id} port {end.portId}")
        return self


WorksheetObject = Annotated[Union[CalculationObject, ArrangementObject], Field(discriminator="kind")]


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


def is_calculation_object(obj: CalculationObject | ArrangementObject) -> TypeGuard[CalculationObject]:
    return getattr(obj, "kind", "calculation") != "arrangement"


def is_arrangement_object(obj: CalculationObject | ArrangementObject) -> TypeGuard[ArrangementObject]:
    return getattr(obj, "kind", "calculation") == "arrangement"


def is_value_flow_edge(edge: Edge) -> bool:
    return (edge.relationType or "value_flow") == "value_flow"


class ProjectDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    objects: list[CalculationObject | ArrangementObject] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def tag_object_kinds(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        objects = data.get("objects")
        if not isinstance(objects, list):
            return data
        tagged: list[object] = []
        for item in objects:
            if isinstance(item, dict) and "kind" not in item:
                kind = "arrangement" if "domain" in item else "calculation"
                tagged.append({**item, "kind": kind})
            else:
                tagged.append(item)
        return {**data, "objects": tagged}


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
