from __future__ import annotations

import pytest

from engcalc.engine import evaluate_project
from engcalc.models import (
    CalculationObject,
    FormulaVariable,
    InputVariable,
    OutputBinding,
    Position,
    ProjectDocument,
)
from engcalc.quantities import QuantityError, infer_formula_quantity


def test_untyped_number_inherits_variable_quantity() -> None:
    quantity, unit = infer_formula_quantity(
        "POUT - 12",
        {"POUT": "pressure"},
    )
    assert quantity == "pressure"
    assert unit == "Pa"


def test_untyped_number_on_left_inherits() -> None:
    quantity, unit = infer_formula_quantity("12 + PIN", {"PIN": "pressure"})
    assert quantity == "pressure"
    assert unit == "Pa"


def test_numeric_subexpression_inherits() -> None:
    quantity, unit = infer_formula_quantity("POUT - (12 + 3)", {"POUT": "pressure"})
    assert quantity == "pressure"


def test_untyped_variable_inherits_known_side() -> None:
    quantity, unit = infer_formula_quantity("POUT - OFFSET", {"POUT": "pressure", "OFFSET": None})
    assert quantity == "pressure"
    assert unit == "Pa"


def test_incompatible_variables_raise_korean_mismatch() -> None:
    with pytest.raises(QuantityError) as exc:
        infer_formula_quantity(
            "POUT - FLOW",
            {"POUT": "pressure", "FLOW": "mass_flow"},
        )
    assert exc.value.code == "QUANTITY_MISMATCH"
    assert "하나의 물성으로 결합할 수 없습니다" in exc.value.message
    assert "POUT(압력/Pa)" in exc.value.message
    assert "FLOW(질량유량/kg/s)" in exc.value.message


def test_same_quantity_subtract_ok() -> None:
    quantity, unit = infer_formula_quantity(
        "POUT - PIN",
        {"POUT": "pressure", "PIN": "pressure"},
    )
    assert quantity == "pressure"
    assert unit == "Pa"


def test_engine_marks_calc_error_on_quantity_mismatch() -> None:
    project = ProjectDocument(
        id="qty",
        name="qty",
        objects=[
            CalculationObject(
                id="obj-1",
                name="Object 1",
                position=Position(x=0, y=0),
                inputs=[
                    InputVariable(id="POUT", value=15, quantity="pressure"),
                    InputVariable(id="FLOW", value=120, quantity="mass_flow"),
                ],
                calculations=[FormulaVariable(id="BAD", formula="POUT - FLOW")],
                outputs=[OutputBinding(id="BAD", sourceVariableId="BAD")],
            )
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert any(err.code == "QUANTITY_MISMATCH" for err in result.errors)
    calc = result.project.objects[0].calculations[0]
    assert calc.status == "error"
    assert calc.error is not None and "결합할 수 없습니다" in calc.error
    assert calc.value == -105.0


def test_engine_inherits_unit_for_pout_minus_number() -> None:
    project = ProjectDocument(
        id="qty",
        name="qty",
        objects=[
            CalculationObject(
                id="obj-1",
                name="Object 1",
                position=Position(x=0, y=0),
                inputs=[InputVariable(id="POUT", value=15, quantity="pressure")],
                calculations=[FormulaVariable(id="DP", formula="POUT - 12")],
                outputs=[],
            )
        ],
        edges=[],
    )
    result = evaluate_project(project)
    assert result.errors == []
    calc = result.project.objects[0].calculations[0]
    assert calc.value == 3.0
    assert calc.quantity == "pressure"
    assert calc.unit == "Pa"
    assert calc.status == "ok"
