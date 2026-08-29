from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from engcalc.engine import evaluate_project
from engcalc.models import (
    ArrangementDomain,
    ArrangementEquipment,
    ArrangementObject,
    ArrangementPoint,
    ArrangementView,
    CalculationObject,
    Edge,
    ElementView,
    FormulaVariable,
    InputVariable,
    OutputBinding,
    PointEnd,
    Position,
    ProjectDocument,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def _arrangement(
    *,
    extra_points: list[ArrangementPoint] | None = None,
    position: Position | None = None,
) -> ArrangementObject:
    points = [
        ArrangementPoint(
            id="PT_1",
            name="Suction",
            a=PointEnd(equipmentId="EQ_1", portId="OUT_1"),
            b=PointEnd(equipmentId="EQ_2", portId="IN_1"),
        ),
        *(extra_points or []),
    ]
    return ArrangementObject(
        id="arr_1",
        name="Arrangement 1",
        position=position or Position(x=80, y=420),
        domain=ArrangementDomain(
            equipment=[
                ArrangementEquipment(id="EQ_1", name="Pump A", inCount=1, outCount=1),
                ArrangementEquipment(id="EQ_2", name="Tank B", inCount=1, outCount=1),
            ],
            points=points,
        ),
        view=ArrangementView(
            width=720,
            height=400,
            elements={
                "EQ_1": ElementView(x=48, y=80, width=112, height=72),
                "EQ_2": ElementView(x=320, y=80, width=112, height=72),
                "PT_1": ElementView(x=180, y=102, width=88, height=28),
            },
        ),
    )


def is_calc(obj: object) -> bool:
    return getattr(obj, "kind", "calculation") != "arrangement"


def test_prototype_calculation_still_runs_with_arrangement() -> None:
    project = ProjectDocument.model_validate_json(EXAMPLES.read_text(encoding="utf-8"))
    project.objects.append(_arrangement())
    result = evaluate_project(project)
    by_id = {obj.id: obj for obj in result.project.objects}
    object_a = by_id["obj-a"]
    object_b = by_id["obj-b"]
    assert is_calc(object_a) and is_calc(object_b)
    power = next(item for item in object_a.calculations if item.id == "POWER")
    result_var = next(item for item in object_b.calculations if item.id == "RESULT")
    assert power.value == 360.0
    assert result_var.value == 720.0
    assert result.evaluatedObjectIds == ["obj-a", "obj-b"]
    assert "arr_1" not in result.evaluatedObjectIds


def test_arrangement_roundtrip_preserves_point_ends() -> None:
    project = ProjectDocument(id="ws", name="ws", objects=[_arrangement()], edges=[])
    restored = ProjectDocument.model_validate(project.model_dump())
    loaded = restored.objects[0]
    assert loaded.kind == "arrangement"
    assert loaded.domain.points[0].connections[0].portId == "OUT_1"  # type: ignore[union-attr]
    assert loaded.domain.points[0].connections[1].equipmentId == "EQ_2"  # type: ignore[union-attr]
    assert loaded.domain.points[0].connectionCount == 2
    assert loaded.view.elements["EQ_2"].x == 320


def test_duplicate_point_id_is_rejected() -> None:
    with pytest.raises(ValidationError, match="DUPLICATE_POINT_ID"):
        _arrangement(extra_points=[ArrangementPoint(id="PT_1", name="dup")])


def test_unknown_point_end_port_is_rejected() -> None:
    with pytest.raises(ValidationError, match="UNKNOWN_POINT"):
        ArrangementObject(
            id="arr_1",
            name="Arrangement 1",
            position=Position(x=0, y=0),
            domain=ArrangementDomain(
                equipment=[ArrangementEquipment(id="EQ_1", inCount=1, outCount=1)],
                points=[
                    ArrangementPoint(
                        id="PT_1",
                        a=PointEnd(equipmentId="EQ_1", portId="OUT_9"),
                    )
                ],
            ),
        )


def test_point_keeps_multiple_connections() -> None:
    point = ArrangementPoint(
        id="PT_1",
        connectionCount=4,
        connections=[
            PointEnd(equipmentId="EQ_1", portId="OUT_1"),
            None,
            None,
            PointEnd(equipmentId="EQ_2", portId="IN_1"),
        ],
    )
    loaded = _arrangement(extra_points=[]).model_copy(
        update={
            "domain": _arrangement().domain.model_copy(update={"points": [point]}),
        }
    )
    restored = ArrangementObject.model_validate(loaded.model_dump())
    assert restored.domain.points[0].connectionCount == 4
    assert restored.domain.points[0].connections[3].portId == "IN_1"  # type: ignore[union-attr]


def test_arrangement_does_not_call_formula_evaluation(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    from engcalc import engine as engine_mod

    real = engine_mod.evaluate_formula

    def wrapped(formula: str, env: dict[str, float]) -> float:
        calls.append(formula)
        return real(formula, env)

    monkeypatch.setattr(engine_mod, "evaluate_formula", wrapped)
    result = evaluate_project(ProjectDocument(id="ws", name="ws", objects=[_arrangement()], edges=[]))
    assert calls == []
    assert result.evaluatedObjectIds == []
