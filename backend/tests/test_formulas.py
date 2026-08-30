from engcalc.formulas import FormulaError, evaluate_formula, referenced_names, rewrite_identifier
import math
import pytest


def test_referenced_names_are_semantic_ids() -> None:
    assert referenced_names("POUT - PIN") == ["PIN", "POUT"]
    assert referenced_names("FLOW * DP") == ["DP", "FLOW"]
    assert referenced_names("LOG(PIN) + ROUND(POUT, 0)") == ["PIN", "POUT"]
    assert referenced_names("=LN(X)") == ["X"]


def test_arithmetic() -> None:
    env = {"FLOW": 120.0, "DP": 3.0, "PIN": 12.0, "POUT": 15.0}
    assert evaluate_formula("POUT - PIN", env) == 3.0
    assert evaluate_formula("FLOW * DP", env) == 360.0
    assert evaluate_formula("INPUT_POWER * 2", {"INPUT_POWER": 360.0}) == 720.0
    assert evaluate_formula("(POUT - PIN) ** 2", env) == 9.0
    assert evaluate_formula("(POUT - PIN)^2", env) == 9.0
    assert evaluate_formula("=POUT - PIN", env) == 3.0


def test_excel_power_and_percent() -> None:
    assert evaluate_formula("2^3", {}) == 8.0
    assert evaluate_formula("-2^2", {}) == 4.0
    assert evaluate_formula("-(2^2)", {}) == -4.0
    assert evaluate_formula("1-2^2", {}) == -3.0
    assert evaluate_formula("10%", {}) == 0.1
    assert evaluate_formula("FLOW * 50%", {"FLOW": 120}) == 60.0
    assert evaluate_formula("MOD(10, 3)", {}) == 1.0


def test_excel_log_exp_round() -> None:
    assert evaluate_formula("LOG(100)", {}) == 2.0
    assert evaluate_formula("LOG(8, 2)", {}) == 3.0
    assert evaluate_formula("log10(1000)", {}) == 3.0
    assert evaluate_formula("LN(EXP(1))", {}) == pytest.approx(1.0)
    assert evaluate_formula("EXP(0)", {}) == 1.0
    assert evaluate_formula("POWER(2, 3)", {}) == 8.0
    assert evaluate_formula("ROUND(2.5, 0)", {}) == 3.0
    assert evaluate_formula("ROUND(-1.5, 0)", {}) == -2.0
    assert evaluate_formula("ROUND(123.456, 2)", {}) == pytest.approx(123.46)
    assert evaluate_formula("ROUNDUP(1.1, 0)", {}) == 2.0
    assert evaluate_formula("ROUNDDOWN(1.9, 0)", {}) == 1.0
    assert evaluate_formula("ABS(-3)", {}) == 3.0
    assert evaluate_formula("SQRT(9)", {}) == 3.0
    assert evaluate_formula("PI()", {}) == pytest.approx(math.pi)
    assert evaluate_formula("MIN(5, 2, 9)", {}) == 2.0
    assert evaluate_formula("MAX(5, 2, 9)", {}) == 9.0


def test_rejects_unknown_function_and_eval() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("FOO(FLOW)", {"FLOW": 1})
    assert exc.value.code == "UNKNOWN_FUNCTION"
    with pytest.raises(FormulaError):
        evaluate_formula("__import__('os').system('pwd')", {})


def test_unresolved_name() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("POUT - PINX", {"POUT": 15})
    assert exc.value.code == "UNRESOLVED_NAME"


def test_division_by_zero() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("FLOW / ZERO", {"FLOW": 10, "ZERO": 0})
    assert exc.value.code == "DIVISION_BY_ZERO"


def test_log_domain_error() -> None:
    with pytest.raises(FormulaError) as exc:
        evaluate_formula("LOG(-1)", {})
    assert exc.value.code == "DOMAIN_ERROR"


def test_rewrite_identifier_does_not_touch_longer_names() -> None:
    assert rewrite_identifier("POUT - PIN", "PIN", "P_IN") == "POUT - P_IN"
    assert rewrite_identifier("PIN + PIN2", "PIN", "X") == "X + PIN2"
    assert rewrite_identifier("LOG(PIN)^2", "PIN", "POUT") == "LOG(POUT)^2"
