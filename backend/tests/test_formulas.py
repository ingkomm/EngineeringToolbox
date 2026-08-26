from engcalc.formulas import FormulaError, evaluate_formula, referenced_names
import pytest


def test_referenced_names_are_semantic_ids() -> None:
    assert referenced_names("POUT - PIN") == ["PIN", "POUT"]
    assert referenced_names("FLOW * DP") == ["DP", "FLOW"]


def test_arithmetic() -> None:
    env = {"FLOW": 120.0, "DP": 3.0, "PIN": 12.0, "POUT": 15.0}
    assert evaluate_formula("POUT - PIN", env) == 3.0
    assert evaluate_formula("FLOW * DP", env) == 360.0
    assert evaluate_formula("INPUT_POWER * 2", {"INPUT_POWER": 360.0}) == 720.0
    assert evaluate_formula("(POUT - PIN) ** 2", env) == 9.0


def test_rejects_cell_address_style_calls_and_eval() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("abs(FLOW)", {"FLOW": 1})
    assert exc.value.code == "UNSUPPORTED_SYNTAX"


def test_unresolved_name() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("POUT - PINX", {"POUT": 15})
    assert exc.value.code == "UNRESOLVED_NAME"


def test_division_by_zero() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("FLOW / ZERO", {"FLOW": 10, "ZERO": 0})
    assert exc.value.code == "DIVISION_BY_ZERO"
