from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from engcalc.engine import evaluate_project
from engcalc.models import (
    ArrangementAnnotation,
    ArrangementConnector,
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
    Position,
    ProjectDocument,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def _arrangement(
    *,
    equipment_view: dict[str, ElementView] | None = None,
    position: Position | None = None,
    extra_points: list[ArrangementPoint] | None = None,
    extra_pipes: list[ArrangementConnector] | None = None,
) -> ArrangementObject:
    points = [
        ArrangementPoint(id="PT_1", name="Suction", attachedToId="EQ_1"),
        *(extra_points or []),
    ]
    view_elements = {
        "EQ_1": ElementView(x=48, y=80, width=96, height=64),
        "EQ_2": ElementView(x=320, y=80, width=96, height=64),
        "PT_1": ElementView(x=80, y=160, width=18, height=18),
        **(equipment_view or {}),
    }
    return ArrangementObject(
        id="arr_1",
        name="Arrangement 1",
        position=position or Position(x=80, y=420),
        domain=ArrangementDomain(
            equipment=[
                ArrangementEquipment(id="EQ_1", name="Pump A", symbolId="generic-equipment"),
                ArrangementEquipment(id="EQ_2", name="Tank B", symbolId="generic-equipment"),
            ],
            points=points,
            pipes=extra_pipes
            or [ArrangementConnector(id="PIPE_1", sourceId="EQ_1", targetId="EQ_2")],
            signals=[ArrangementConnector(id="SIG_1", sourceId="EQ_1", targetId="PT_1")],
            annotations=[ArrangementAnnotation(id="NOTE_1", text="layout only")],
        ),
        view=ArrangementView(width=720, height=400, elements=view_elements),
    )


def _prototype_with_arrangement() -> ProjectDocument:
    project = ProjectDocument.model_validate_json(EXAMPLES.read_text(encoding="utf-8"))
    project.objects.append(_arrangement())
    project.edges.append(
        Edge(
            id="edge-pt-power",
            sourceObjectId="arr_1",
            sourceVariableId="PT_1",
            targetObjectId="obj-a",
            targetVariableId="FLOW",
            relationType="association",
        )
    )
    return project


def test_prototype_calculation_still_runs_with_arrangement() -> None:
    result = evaluate_project(_prototype_with_arrangement())
    codes = {error.code for error in result.errors}
    assert "ARRANGEMENT_HAS_NO_VALUE" not in codes
    by_id = {obj.id: obj for obj in result.project.objects}
    object_a = by_id["obj-a"]
    assert is_calc(object_a)
    power = next(item for item in object_a.calculations if item.id == "POWER")
    object_b = by_id["obj-b"]
    assert is_calc(object_b)
    result_var = next(item for item in object_b.calculations if item.id == "RESULT")
    assert power.value == 360.0
    assert result_var.value == 720.0
    assert result.evaluatedObjectIds == ["obj-a", "obj-b"]
    assert "arr_1" not in result.evaluatedObjectIds
    arrangement = by_id["arr_1"]
    assert arrangement.kind == "arrangement"


def is_calc(obj: object) -> bool:
    return getattr(obj, "kind", "calculation") != "arrangement"


def test_arrangement_roundtrip_preserves_domain_and_view() -> None:
    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[_arrangement()],
        edges=[],
    )
    dumped = project.model_dump()
    restored = ProjectDocument.model_validate(dumped)
    original = project.objects[0]
    loaded = restored.objects[0]
    assert loaded.kind == "arrangement"
    assert loaded.model_dump() == original.model_dump()
    assert loaded.domain.points[0].id == "PT_1"
    assert loaded.domain.pipes[0].sourceId == "EQ_1"
    assert loaded.view.elements["EQ_2"].x == 320
    assert loaded.position.y == 420


def test_moving_arrangement_node_does_not_change_domain() -> None:
    arrangement = _arrangement()
    domain_before = arrangement.domain.model_dump()
    moved = arrangement.model_copy(update={"position": Position(x=400, y=10)})
    assert moved.domain.model_dump() == domain_before
    assert moved.position.x == 400


def test_moving_inner_element_is_view_only() -> None:
    arrangement = _arrangement()
    domain_before = arrangement.domain.model_dump()
    elements = dict(arrangement.view.elements)
    elements["EQ_1"] = elements["EQ_1"].model_copy(update={"x": 200, "y": 40})
    moved = arrangement.model_copy(
        update={"view": arrangement.view.model_copy(update={"elements": elements})}
    )
    assert moved.domain.model_dump() == domain_before
    assert moved.view.elements["EQ_1"].x == 200
    assert arrangement.view.elements["EQ_1"].x == 48


def test_duplicate_point_id_is_rejected() -> None:
    with pytest.raises(ValidationError, match="DUPLICATE_POINT_ID"):
        _arrangement(extra_points=[ArrangementPoint(id="PT_1", name="dup")])


def test_unknown_pipe_endpoint_is_rejected() -> None:
    with pytest.raises(ValidationError, match="UNKNOWN_POINT"):
        _arrangement(
            extra_pipes=[ArrangementConnector(id="PIPE_X", sourceId="EQ_1", targetId="NO_SUCH")]
        )


def test_unknown_point_edge_is_reported() -> None:
    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[
            CalculationObject(
                id="obj_1",
                name="Object 1",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="IN_1", value=1)],
                calculations=[FormulaVariable(id="OUT_1", formula="IN_1")],
                outputs=[OutputBinding(id="OUT_1", sourceVariableId="OUT_1")],
            ),
            _arrangement(),
        ],
        edges=[
            Edge(
                id="bad-point",
                sourceObjectId="arr_1",
                sourceVariableId="PT_MISSING",
                targetObjectId="obj_1",
                targetVariableId="IN_1",
                relationType="association",
            )
        ],
    )
    result = evaluate_project(project)
    assert any(error.code == "UNKNOWN_POINT" for error in result.errors)
    calc = next(obj for obj in result.project.objects if obj.id == "obj_1")
    assert is_calc(calc)
    out = next(item for item in calc.calculations if item.id == "OUT_1")
    assert out.value == 1.0


def test_value_flow_with_arrangement_is_rejected_without_blocking_calc() -> None:
    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[
            CalculationObject(
                id="obj_1",
                name="Object 1",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="IN_1", value=2)],
                calculations=[FormulaVariable(id="OUT_1", formula="IN_1 * 3")],
                outputs=[OutputBinding(id="OUT_1", sourceVariableId="OUT_1")],
            ),
            _arrangement(),
        ],
        edges=[
            Edge(
                id="illegal-value",
                sourceObjectId="obj_1",
                sourceVariableId="OUT_1",
                targetObjectId="arr_1",
                targetVariableId="PT_1",
                relationType="value_flow",
            )
        ],
    )
    result = evaluate_project(project)
    assert any(error.code == "ARRANGEMENT_HAS_NO_VALUE" for error in result.errors)
    calc = next(obj for obj in result.project.objects if obj.id == "obj_1")
    assert is_calc(calc)
    out = next(item for item in calc.calculations if item.id == "OUT_1")
    assert out.value == 6.0
    assert result.evaluatedObjectIds == ["obj_1"]


def test_arrangement_does_not_call_formula_evaluation(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    from engcalc import engine as engine_mod

    real = engine_mod.evaluate_formula

    def wrapped(formula: str, env: dict[str, float]) -> float:
        calls.append(formula)
        return real(formula, env)

    monkeypatch.setattr(engine_mod, "evaluate_formula", wrapped)

    arrangement_only = ProjectDocument(id="ws", name="ws", objects=[_arrangement()], edges=[])
    result = evaluate_project(arrangement_only)
    assert calls == []
    assert result.evaluatedObjectIds == []

    mixed = _prototype_with_arrangement()
    calls.clear()
    evaluated = evaluate_project(mixed)
    assert calls
    assert all("PIPE" not in formula and "EQ_" not in formula for formula in calls)
    assert "arr_1" not in evaluated.evaluatedObjectIds


def test_legacy_calculation_json_without_kind_still_loads() -> None:
    document = ProjectDocument.model_validate(
        {
            "id": "legacy",
            "name": "legacy",
            "objects": [
                {
                    "id": "obj_1",
                    "name": "Object 1",
                    "position": {"x": 0, "y": 0},
                    "inputs": [{"id": "X", "value": 4}],
                    "calculations": [{"id": "Y", "formula": "X + 1"}],
                    "outputs": [{"id": "Y", "sourceVariableId": "Y"}],
                }
            ],
            "edges": [],
        }
    )
    assert document.objects[0].kind == "calculation"
    result = evaluate_project(document)
    calc = document.objects[0]
    assert is_calc(calc)
    assert result.project.objects[0].calculations[0].value == 5.0  # type: ignore[union-attr]
