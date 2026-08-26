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
    mapped = next(item for item in object_b.inputs if item.id == "POWER")
    result_var = next(item for item in object_b.calculations if item.id == "RESULT")
    assert mapped.status == "mapped"
    assert mapped.value == 360.0
    assert mapped.name == "POWER"
    assert result_var.formula == "POWER * 2"
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
                inputs=[InputVariable(id="IN_L", value=1)],
                calculations=[FormulaVariable(id="LEFT_OUT", formula="IN_L")],
                outputs=[OutputBinding(id="LEFT_OUT", sourceVariableId="LEFT_OUT")],
            ),
            CalculationObject(
                id="right",
                name="Right",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="IN_R", value=None)],
                calculations=[FormulaVariable(id="RIGHT_OUT", formula="IN_R")],
                outputs=[OutputBinding(id="RIGHT_OUT", sourceVariableId="RIGHT_OUT")],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="left",
                sourceVariableId="LEFT_OUT",
                targetObjectId="right",
                targetVariableId="IN_R",
            ),
            Edge(
                id="e2",
                sourceObjectId="right",
                sourceVariableId="RIGHT_OUT",
                targetObjectId="left",
                targetVariableId="IN_L",
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


def test_mapped_quantity_follows_source_including_later_changes() -> None:
    project = ProjectDocument(
        id="follow",
        name="follow",
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
                id="mid",
                name="Mid",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="T", value=None, quantity="temperature")],
                calculations=[FormulaVariable(id="TWICE", formula="P * 2")],
                outputs=[OutputBinding(id="TWICE", sourceVariableId="TWICE")],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="src",
                sourceVariableId="P",
                targetObjectId="mid",
                targetVariableId="T",
            )
        ],
    )
    result = evaluate_project(project)
    assert result.errors == []
    mid = next(obj for obj in result.project.objects if obj.id == "mid")
    mapped = mid.inputs[0]
    assert mapped.id == "P"
    assert mapped.quantity == "pressure"
    assert mapped.unit == "Pa"
    assert mapped.value == 10.0
    twice = next(item for item in mid.calculations if item.id == "TWICE")
    assert twice.quantity == "pressure"
    assert twice.unit == "Pa"

    mutated = result.project.model_copy(deep=True)
    source = next(obj for obj in mutated.objects if obj.id == "src")
    source.inputs[0].quantity = "temperature"
    source.inputs[0].unit = "K"
    again = evaluate_project(mutated, dirty_object_ids=["src"])
    mid = next(obj for obj in again.project.objects if obj.id == "mid")
    mapped = mid.inputs[0]
    assert mapped.quantity == "temperature"
    assert mapped.unit == "K"
    twice = next(item for item in mid.calculations if item.id == "TWICE")
    assert twice.quantity == "temperature"
    assert twice.unit == "K"


def test_mapped_quantity_follows_source_through_a_chain() -> None:
    project = ProjectDocument(
        id="chain",
        name="chain",
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
                id="mid",
                name="Mid",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="P", value=None, quantity="temperature")],
                calculations=[],
                outputs=[OutputBinding(id="P", sourceVariableId="P")],
            ),
            CalculationObject(
                id="dst",
                name="Dst",
                position=Position(x=2, y=0),
                inputs=[InputVariable(id="P", value=None, quantity="length")],
                calculations=[],
                outputs=[OutputBinding(id="P", sourceVariableId="P")],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="src",
                sourceVariableId="P",
                targetObjectId="mid",
                targetVariableId="P",
            ),
            Edge(
                id="e2",
                sourceObjectId="mid",
                sourceVariableId="P",
                targetObjectId="dst",
                targetVariableId="P",
            ),
        ],
    )
    result = evaluate_project(project)
    assert result.errors == []
    by_id = {obj.id: obj for obj in result.project.objects}
    assert by_id["mid"].inputs[0].quantity == "pressure"
    assert by_id["dst"].inputs[0].quantity == "pressure"
    assert by_id["dst"].inputs[0].unit == "Pa"

    mutated = result.project.model_copy(deep=True)
    next(obj for obj in mutated.objects if obj.id == "src").inputs[0].quantity = "temperature"
    again = evaluate_project(mutated, dirty_object_ids=["src"])
    by_id = {obj.id: obj for obj in again.project.objects}
    assert by_id["mid"].inputs[0].quantity == "temperature"
    assert by_id["mid"].inputs[0].unit == "K"
    assert by_id["dst"].inputs[0].quantity == "temperature"
    assert by_id["dst"].inputs[0].unit == "K"


def test_global_variable_ids_must_be_unique() -> None:
    project = ProjectDocument(
        id="dup",
        name="dup",
        objects=[
            CalculationObject(
                id="a",
                name="A",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="FLOW", value=1)],
                calculations=[],
                outputs=[OutputBinding(id="FLOW", sourceVariableId="FLOW")],
            ),
            CalculationObject(
                id="b",
                name="B",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="FLOW", value=2)],
                calculations=[],
                outputs=[],
            ),
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert any(err.code == "DUPLICATE_VARIABLE_ID" for err in result.errors)


def test_global_variable_names_must_be_unique() -> None:
    project = ProjectDocument(
        id="dup",
        name="dup",
        objects=[
            CalculationObject(
                id="a",
                name="A",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="FLOW", name="유량", value=1)],
                calculations=[],
                outputs=[],
            ),
            CalculationObject(
                id="b",
                name="B",
                position=Position(x=1, y=0),
                calculations=[FormulaVariable(id="Q", name="유량", formula="1")],
                outputs=[],
            ),
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert any(err.code == "DUPLICATE_VARIABLE_NAME" for err in result.errors)


def test_mapped_input_inherits_source_id_and_name() -> None:
    project = ProjectDocument(
        id="map",
        name="map",
        objects=[
            CalculationObject(
                id="src",
                name="Src",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="P", name="압력", value=10, quantity="pressure")],
                calculations=[],
                outputs=[OutputBinding(id="P", name="압력", sourceVariableId="P")],
            ),
            CalculationObject(
                id="dst",
                name="Dst",
                position=Position(x=1, y=0),
                inputs=[InputVariable(id="IN_1", value=None)],
                calculations=[FormulaVariable(id="TWICE", formula="IN_1 * 2")],
                outputs=[OutputBinding(id="TWICE", sourceVariableId="TWICE")],
            ),
        ],
        edges=[
            Edge(
                id="e1",
                sourceObjectId="src",
                sourceVariableId="P",
                targetObjectId="dst",
                targetVariableId="IN_1",
            )
        ],
    )
    result = evaluate_project(project)
    assert result.errors == []
    dest = next(obj for obj in result.project.objects if obj.id == "dst")
    mapped = dest.inputs[0]
    assert mapped.id == "P"
    assert mapped.name == "압력"
    assert mapped.value == 10
    assert dest.calculations[0].formula == "P * 2"
    assert dest.calculations[0].value == 20


def test_disabled_edge_does_not_map_values() -> None:
    project = ProjectDocument(
        id="off",
        name="off",
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
                inputs=[InputVariable(id="LOCAL", value=4)],
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
                targetVariableId="LOCAL",
                enabled=False,
            )
        ],
    )
    result = evaluate_project(project)
    dest = next(obj for obj in result.project.objects if obj.id == "dst")
    assert dest.inputs[0].id == "LOCAL"
    assert dest.inputs[0].value == 4.0
    assert dest.inputs[0].status == "ok"


def test_excel_functions_evaluate_on_a_calculation_object() -> None:
    project = ProjectDocument(
        id="xl",
        name="xl",
        objects=[
            CalculationObject(
                id="obj",
                name="Obj",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="PIN", value=12.4, quantity="pressure")],
                calculations=[
                    FormulaVariable(id="P2", formula="ROUND(PIN, 0)"),
                    FormulaVariable(id="RATIO", formula="LOG(100)"),
                    FormulaVariable(id="GROWTH", formula="EXP(0)"),
                ],
                outputs=[],
            )
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert result.errors == []
    by_id = {item.id: item for item in result.project.objects[0].calculations}
    assert by_id["P2"].value == 12.0
    assert by_id["P2"].quantity == "pressure"
    assert by_id["RATIO"].value == 2.0
    assert by_id["RATIO"].quantity == "dimensionless"
    assert by_id["GROWTH"].value == 1.0
