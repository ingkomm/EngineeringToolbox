from __future__ import annotations

import json
from pathlib import Path

from engcalc.engine import evaluate_project
from engcalc.models import (
    CalculationObject,
    Edge,
    FormulaVariable,
    InputVariable,
    OutputBinding,
    Position,
    ProjectDocument,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def load_prototype() -> ProjectDocument:
    return ProjectDocument.model_validate_json(EXAMPLES.read_text(encoding="utf-8"))


def test_prototype_example_values() -> None:
    result = evaluate_project(load_prototype())
    assert result.errors == []
    by_id = {obj.id: obj for obj in result.project.objects}

    object_a = by_id["obj-a"]
    dp = next(item for item in object_a.calculations if item.id == "DP")
    power = next(item for item in object_a.calculations if item.id == "POWER")
    power_out = next(item for item in object_a.outputs if item.id == "POWER")
    assert dp.value == 3.0
    assert power.value == 360.0
    assert power_out.value == 360.0

    object_b = by_id["obj-b"]
    mapped = next(item for item in object_b.inputs if item.id == "INPUT_POWER")
    result_var = next(item for item in object_b.calculations if item.id == "RESULT")
    assert mapped.status == "mapped"
    assert mapped.value == 360.0
    assert result_var.value == 720.0
    assert result.evaluatedObjectIds == ["obj-a", "obj-b"]


def test_flow_change_updates_downstream_only() -> None:
    project = load_prototype()
    extra = CalculationObject(
        id="obj-c",
        name="Independent",
        position=Position(x=0, y=0),
        inputs=[InputVariable(id="X", value=5)],
        calculations=[FormulaVariable(id="Y", formula="X * 10")],
        outputs=[OutputBinding(id="Y", sourceVariableId="Y")],
    )
    project.objects.append(extra)

    baseline = evaluate_project(project)
    independent = next(obj for obj in baseline.project.objects if obj.id == "obj-c")
    independent_y = next(item for item in independent.calculations if item.id == "Y")
    assert independent_y.value == 50.0

    mutated = baseline.project.model_copy(deep=True)
    object_a = next(obj for obj in mutated.objects if obj.id == "obj-a")
    flow = next(item for item in object_a.inputs if item.id == "FLOW")
    flow.value = 200

    incremental = evaluate_project(mutated, dirty_object_ids=["obj-a"])
    assert set(incremental.evaluatedObjectIds) == {"obj-a", "obj-b"}
    assert "obj-c" not in incremental.evaluatedObjectIds

    by_id = {obj.id: obj for obj in incremental.project.objects}
    power = next(item for item in by_id["obj-a"].calculations if item.id == "POWER")
    result_var = next(item for item in by_id["obj-b"].calculations if item.id == "RESULT")
    independent_after = next(item for item in by_id["obj-c"].calculations if item.id == "Y")
    assert power.value == 600.0
    assert result_var.value == 1200.0
    assert independent_after.value == 50.0


def test_cycle_is_rejected() -> None:
    project = ProjectDocument(
        id="cycle",
        name="cycle",
        objects=[
            CalculationObject(
                id="left",
                name="Left",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="IN", value=1)],
                calculations=[FormulaVariable(id="OUTV", formula="IN")],
                outputs=[OutputBinding(id="OUTV", sourceVariableId="OUTV")],
            ),
            CalculationObject(
                id="right",
                name="Right",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="IN", value=None)],
                calculations=[FormulaVariable(id="OUTV", formula="IN")],
                outputs=[OutputBinding(id="OUTV", sourceVariableId="OUTV")],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="left",
                sourceVariableId="OUTV",
                targetObjectId="right",
                targetVariableId="IN",
            ),
            Edge(
                id="e2",
                sourceObjectId="right",
                sourceVariableId="OUTV",
                targetObjectId="left",
                targetVariableId="IN",
            ),
        ],
    )
    result = evaluate_project(project)
    assert any(err.code == "CYCLE_DETECTED" for err in result.errors)
    assert result.evaluatedObjectIds == []


def test_engine_is_pure_json_roundtrip() -> None:
    project = load_prototype()
    result = evaluate_project(project)
    payload = json.loads(result.model_dump_json())
    assert payload["project"]["objects"][0]["calculations"][1]["value"] == 360.0
    assert payload["project"]["objects"][0]["inputs"][0]["unit"] == "kg/s"


def test_draft_object_is_idle_not_error() -> None:
    project = ProjectDocument(
        id="draft",
        name="draft",
        objects=[
            CalculationObject(
                id="obj-1",
                name="Object 1",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="FLOW", value=None, quantity="mass_flow")],
                calculations=[FormulaVariable(id="POWER", formula="", quantity="power")],
                outputs=[OutputBinding(id="POWER", sourceVariableId="POWER")],
            )
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert result.errors == []
    obj = result.project.objects[0]
    assert obj.inputs[0].status == "idle"
    assert obj.inputs[0].unit == "kg/s"
    assert obj.calculations[0].status == "idle"
    assert obj.outputs[0].status == "idle"


def test_quantity_mismatch_on_mapping() -> None:
    project = ProjectDocument(
        id="mismatch",
        name="mismatch",
        objects=[
            CalculationObject(
                id="src",
                name="Src",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="P", value=10, quantity="pressure")],
                calculations=[],
                outputs=[OutputBinding(id="P", sourceVariableId="P")],
            ),
            CalculationObject(
                id="dst",
                name="Dst",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="T", value=None, quantity="temperature")],
                calculations=[],
                outputs=[],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="src",
                sourceVariableId="P",
                targetObjectId="dst",
                targetVariableId="T",
            )
        ],
    )
    result = evaluate_project(project)
    assert any(err.code == "QUANTITY_MISMATCH" for err in result.errors)
    dest = next(obj for obj in result.project.objects if obj.id == "dst")
    assert dest.inputs[0].value is None
