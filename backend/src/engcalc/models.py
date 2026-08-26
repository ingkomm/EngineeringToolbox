"""Pydantic models matching shared/schema/project.schema.json."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VariableStatus = Literal["idle", "ok", "mapped", "error"]


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


class InputVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None


class FormulaVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    formula: str = ""
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None


class OutputBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    sourceVariableId: str
    value: float | None = None
    quantity: str | None = None
    unit: str | None = None
    status: VariableStatus = "idle"
    error: str | None = None


class CalculationObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    position: Position
    inputs: list[InputVariable] = Field(default_factory=list)
    calculations: list[FormulaVariable] = Field(default_factory=list)
    outputs: list[OutputBinding] = Field(default_factory=list)


class Edge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    sourceObjectId: str
    sourceVariableId: str
    targetObjectId: str
    targetVariableId: str


class ProjectDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    objects: list[CalculationObject] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)


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
