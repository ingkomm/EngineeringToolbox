from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from engcalc.engine import evaluate_project
from engcalc.models import (
    EquipmentObject,
    PointEnd,
    PointObject,
    Position,
    ProjectDocument,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def _layout() -> list[EquipmentObject | PointObject]:
    return [
        EquipmentObject(id="EQ_1", name="Pump A", position=Position(x=128, y=500), inCount=1, outCount=1),
        EquipmentObject(id="EQ_2", name="Tank B", position=Position(x=400, y=500), inCount=1, outCount=1),
        PointObject(
            id="PT_1",
            name="Suction",
            position=Position(x=260, y=522),
            connectionCount=2,
            connections=[
                PointEnd(equipmentId="EQ_1", portId="OUT_1"),
                PointEnd(equipmentId="EQ_2", portId="IN_1"),
            ],
        ),
    ]


def is_calc(obj: object) -> bool:
    return getattr(obj, "kind", "calculation") == "calculation"


def test_prototype_calculation_still_runs_with_layout_objects() -> None:
    project = ProjectDocument.model_validate_json(EXAMPLES.read_text(encoding="utf-8"))
    project.objects.extend(_layout())
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
    assert "EQ_1" not in result.evaluatedObjectIds
    assert "PT_1" not in result.evaluatedObjectIds


def test_layout_roundtrip_preserves_point_connections() -> None:
    project = ProjectDocument(id="ws", name="ws", objects=_layout(), edges=[])
    restored = ProjectDocument.model_validate(project.model_dump())
    point = next(obj for obj in restored.objects if obj.id == "PT_1")
    assert point.kind == "point"
    assert point.connections[0].portId == "OUT_1"  # type: ignore[union-attr]
    assert point.connections[0].objectId == "EQ_1"  # type: ignore[union-attr]
    assert point.connections[1].objectId == "EQ_2"  # type: ignore[union-attr]
    assert not hasattr(point.connections[1], "equipmentId") or getattr(point.connections[1], "equipmentId", None) is None
    equipment = next(obj for obj in restored.objects if obj.id == "EQ_2")
    assert equipment.position.x == 400


def test_duplicate_point_id_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ProjectDocument(
            id="ws",
            name="ws",
            objects=[
                PointObject(id="PT_1", name="one", position=Position(x=0, y=0)),
                PointObject(id="PT_1", name="dup", position=Position(x=1, y=1)),
            ],
            edges=[],
        )


def test_unknown_point_end_port_is_rejected() -> None:
    with pytest.raises(ValidationError, match="UNKNOWN_POINT"):
        ProjectDocument(
            id="ws",
            name="ws",
            objects=[
                EquipmentObject(id="EQ_1", position=Position(x=0, y=0), inCount=1, outCount=1),
                PointObject(
                    id="PT_1",
                    position=Position(x=0, y=0),
                    connections=[PointEnd(equipmentId="EQ_1", portId="OUT_9")],
                ),
            ],
            edges=[],
        )


def test_explodes_legacy_arrangement_object() -> None:
    project = ProjectDocument.model_validate(
        {
            "id": "ws",
            "name": "ws",
            "objects": [
                {
                    "kind": "arrangement",
                    "id": "arr_1",
                    "name": "Arrangement 1",
                    "position": {"x": 10, "y": 20},
                    "domain": {
                        "equipment": [{"id": "EQ_1", "name": "Pump A", "inCount": 1, "outCount": 1}],
                        "points": [
                            {
                                "id": "PT_1",
                                "a": {"equipmentId": "EQ_1", "portId": "OUT_1"},
                                "b": None,
                            }
                        ],
                    },
                    "view": {
                        "width": 720,
                        "height": 400,
                        "elements": {
                            "EQ_1": {"x": 48, "y": 80},
                            "PT_1": {"x": 180, "y": 102},
                        },
                    },
                }
            ],
            "edges": [],
        }
    )
    ids = [obj.id for obj in project.objects]
    assert "arr_1" not in ids
    equipment = next(obj for obj in project.objects if obj.id == "EQ_1")
    point = next(obj for obj in project.objects if obj.id == "PT_1")
    assert equipment.kind == "equipment"
    assert equipment.position.x == 58
    assert point.kind == "point"
    assert point.connections[0].portId == "OUT_1"  # type: ignore[union-attr]


def test_point_keeps_four_connections() -> None:
    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[
            EquipmentObject(id="EQ_1", position=Position(x=0, y=0), inCount=1, outCount=1),
            EquipmentObject(id="EQ_2", position=Position(x=1, y=0), inCount=1, outCount=1),
            PointObject(
                id="PT_1",
                position=Position(x=2, y=0),
                connectionCount=4,
                connections=[
                    PointEnd(equipmentId="EQ_1", portId="OUT_1"),
                    None,
                    None,
                    PointEnd(equipmentId="EQ_2", portId="IN_1"),
                ],
            ),
        ],
        edges=[],
    )
    restored = ProjectDocument.model_validate(project.model_dump())
    point = next(obj for obj in restored.objects if obj.id == "PT_1")
    assert point.connectionCount == 4
    assert point.connections[3].portId == "IN_1"  # type: ignore[union-attr]


def test_layout_objects_do_not_call_formula_evaluation(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    from engcalc import engine as engine_mod

    real = engine_mod.evaluate_formula

    def wrapped(formula: str, env: dict[str, float]) -> float:
        calls.append(formula)
        return real(formula, env)

    monkeypatch.setattr(engine_mod, "evaluate_formula", wrapped)
    result = evaluate_project(ProjectDocument(id="ws", name="ws", objects=_layout(), edges=[]))
    assert calls == []
    assert result.evaluatedObjectIds == []


def test_point_can_connect_to_another_point() -> None:
    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[
            PointObject(id="PT_1", position=Position(x=0, y=0), connectionCount=2),
            PointObject(
                id="PT_2",
                position=Position(x=1, y=0),
                connectionCount=2,
                connections=[PointEnd(objectId="PT_1", portId="C_1"), None],
            ),
        ],
        edges=[],
    )
    restored = ProjectDocument.model_validate(project.model_dump())
    point = next(obj for obj in restored.objects if obj.id == "PT_2")
    assert point.connections[0].objectId == "PT_1"  # type: ignore[union-attr]
    assert point.connections[0].portId == "C_1"  # type: ignore[union-attr]
    assert point.connections[0].reversed is False  # type: ignore[union-attr]


def test_legacy_equipment_id_migrates_to_object_id() -> None:
    project = ProjectDocument.model_validate(
        {
            "id": "ws",
            "name": "ws",
            "objects": [
                {"kind": "equipment", "id": "EQ_1", "name": "Pump", "position": {"x": 0, "y": 0}, "inCount": 1, "outCount": 1},
                {
                    "kind": "point",
                    "id": "PT_1",
                    "name": "PT_1",
                    "position": {"x": 1, "y": 0},
                    "connections": [{"equipmentId": "EQ_1", "portId": "OUT_1"}],
                },
            ],
            "edges": [],
        }
    )
    point = next(obj for obj in project.objects if obj.id == "PT_1")
    assert point.connections[0].objectId == "EQ_1"  # type: ignore[union-attr]
    dumped = point.connections[0].model_dump()  # type: ignore[union-attr]
    assert "equipmentId" not in dumped
    assert dumped["reversed"] is False


def test_calculation_link_association_is_not_evaluated() -> None:
    from engcalc.models import CalculationObject, Edge

    project = ProjectDocument(
        id="ws",
        name="ws",
        objects=[
            CalculationObject(
                id="obj_1",
                name="Calc",
                position=Position(x=0, y=0),
                links=[{"id": "LINK_1", "name": "LINK_1", "targetObjectId": "PT_1", "targetPortId": "C_1"}],
            ),
            PointObject(id="PT_1", position=Position(x=1, y=0)),
        ],
        edges=[
            Edge(
                id="edge-obj_1-LINK_1-PT_1-C_1",
                sourceObjectId="obj_1",
                sourceVariableId="LINK_1",
                targetObjectId="PT_1",
                targetVariableId="C_1",
                relationType="association",
            )
        ],
    )
    result = evaluate_project(project)
    assert result.evaluatedObjectIds == []
    assert result.errors == []
