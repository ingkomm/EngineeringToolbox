"""Safe formula parser/evaluator. No eval(), no cell addresses.

Excel-like operators and functions: ^, postfix %, LOG/LN/EXP/ROUND, and related math.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from typing import Callable, Iterable

ALLOWED_BINOPS: dict[type[ast.operator], object] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
}

ALLOWED_UNARY: dict[type[ast.unaryop], object] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


class FormulaError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _excel_round(number: float, digits: float = 0) -> float:
    """Excel ROUND: half away from zero (not Python banker's rounding)."""
    places = int(digits)
    factor = 10.0**places
    scaled = number * factor
    if scaled >= 0:
        return math.floor(scaled + 0.5) / factor
    return math.ceil(scaled - 0.5) / factor


def _excel_roundup(number: float, digits: float = 0) -> float:
    places = int(digits)
    factor = 10.0**places
    scaled = number * factor
    if scaled >= 0:
        return math.ceil(scaled) / factor
    return math.floor(scaled) / factor


def _excel_trunc(number: float, digits: float = 0) -> float:
    places = int(digits)
    factor = 10.0**places
    return math.trunc(number * factor) / factor


def _excel_mod(number: float, divisor: float) -> float:
    if divisor == 0:
        raise FormulaError("DIVISION_BY_ZERO", "Division by zero")
    return number - divisor * math.floor(number / divisor)


def _excel_log(number: float, base: float = 10.0) -> float:
    if number <= 0:
        raise FormulaError("DOMAIN_ERROR", "LOG is only defined for positive numbers")
    if base <= 0 or base == 1:
        raise FormulaError("DOMAIN_ERROR", "LOG base must be positive and not 1")
    return math.log(number, base)


def _excel_ln(number: float) -> float:
    if number <= 0:
        raise FormulaError("DOMAIN_ERROR", "LN is only defined for positive numbers")
    return math.log(number)


def _excel_log10(number: float) -> float:
    if number <= 0:
        raise FormulaError("DOMAIN_ERROR", "LOG10 is only defined for positive numbers")
    return math.log10(number)


def _excel_sqrt(number: float) -> float:
    if number < 0:
        raise FormulaError("DOMAIN_ERROR", "SQRT is only defined for non-negative numbers")
    return math.sqrt(number)


def _excel_power(number: float, power: float) -> float:
    try:
        return float(number**power)
    except ZeroDivisionError as exc:
        raise FormulaError("DIVISION_BY_ZERO", "Division by zero") from exc
    except ValueError as exc:
        raise FormulaError("DOMAIN_ERROR", "POWER is not defined for these arguments") from exc


def _excel_sign(number: float) -> float:
    if number > 0:
        return 1.0
    if number < 0:
        return -1.0
    return 0.0


FnImpl = Callable[..., float]

# Excel-style functions: (min_args, max_args or None for open), implementation
FORMULA_FUNCTIONS: dict[str, tuple[int, int | None, FnImpl]] = {
    "ABS": (1, 1, lambda x: abs(x)),
    "EXP": (1, 1, math.exp),
    "INT": (1, 1, math.floor),
    "LN": (1, 1, _excel_ln),
    "LOG": (1, 2, _excel_log),
    "LOG10": (1, 1, _excel_log10),
    "MAX": (1, None, lambda *xs: max(xs)),
    "MIN": (1, None, lambda *xs: min(xs)),
    "MOD": (2, 2, _excel_mod),
    "PI": (0, 0, lambda: math.pi),
    "POWER": (2, 2, _excel_power),
    "ROUND": (1, 2, _excel_round),
    "ROUNDDOWN": (1, 2, _excel_trunc),
    "ROUNDUP": (1, 2, _excel_roundup),
    "SIGN": (1, 1, _excel_sign),
    "SQRT": (1, 1, _excel_sqrt),
    "TRUNC": (1, 2, _excel_trunc),
}

FUNCTION_HINTS: tuple[tuple[str, str], ...] = (
    ("ABS", "ABS(number)"),
    ("EXP", "EXP(number) · e^n"),
    ("INT", "INT(number)"),
    ("LN", "LN(number) · 자연로그"),
    ("LOG", "LOG(number, [base]) · 기본 밑 10"),
    ("LOG10", "LOG10(number)"),
    ("MAX", "MAX(n1, n2, …)"),
    ("MIN", "MIN(n1, n2, …)"),
    ("MOD", "MOD(number, divisor)"),
    ("PI", "PI()"),
    ("POWER", "POWER(number, power)"),
    ("ROUND", "ROUND(number, [digits])"),
    ("ROUNDDOWN", "ROUNDDOWN(number, [digits])"),
    ("ROUNDUP", "ROUNDUP(number, [digits])"),
    ("SIGN", "SIGN(number)"),
    ("SQRT", "SQRT(number)"),
    ("TRUNC", "TRUNC(number, [digits])"),
)


def parse_expression(formula: str) -> ast.Expression:
    text = normalize_formula(formula)
    if not text:
        raise FormulaError("EMPTY_FORMULA", "Formula is empty")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise FormulaError("INVALID_FORMULA", f"Invalid formula: {formula}") from exc
    _assert_allowed(tree.body)
    return tree


def normalize_formula(formula: str) -> str:
    """Rewrite Excel operators into a Python AST-compatible expression."""
    text = formula.strip()
    if text.startswith("="):
        text = text[1:].lstrip()
    text = _rewrite_excel_power(text)
    text = _rewrite_excel_percent(text)
    return text


def _rewrite_excel_power(text: str) -> str:
    """Excel `^` is exponentiation. `-2^2` is 4 because -2 is a signed literal."""

    def replace_signed(match: re.Match[str]) -> str:
        start = match.start()
        before = text[:start].rstrip()
        if before and (before[-1].isalnum() or before[-1] in "._)"):
            return match.group(0)
        return f"(-{match.group(1)})**"

    text = re.sub(r"-(\d+(?:\.\d*)?|\.\d+)\s*\^", replace_signed, text)
    return text.replace("^", "**")


def _rewrite_excel_percent(text: str) -> str:
    """Postfix `%` is Excel percent (10% → 0.1). Infix `%` stays modulo."""
    pattern = re.compile(
        r"(\d+(?:\.\d*)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|\))\s*%(?!\s*[A-Za-z0-9_.(])"
    )
    prev = None
    while prev != text:
        prev = text
        text = pattern.sub(r"(\1/100)", text)
    return text


def referenced_names(formula: str) -> list[str]:
    tree = parse_expression(formula)
    return sorted(set(_variable_names(tree)))


def _call_func_ids(tree: ast.AST) -> set[int]:
    return {
        id(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }


def _variable_names(tree: ast.AST) -> list[str]:
    skip = _call_func_ids(tree)
    return [node.id for node in ast.walk(tree) if isinstance(node, ast.Name) and id(node) not in skip]


def evaluate_formula(formula: str, env: dict[str, float]) -> float:
    tree = parse_expression(formula)
    missing = [name for name in _variable_names(tree) if name not in env]
    if missing:
        unique = ", ".join(sorted(set(missing)))
        raise FormulaError("UNRESOLVED_NAME", f"Unresolved variables: {unique}")
    try:
        value = _eval_node(tree.body, env)
    except OverflowError as exc:
        raise FormulaError("OVERFLOW", "Formula result is too large") from exc
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FormulaError("NON_NUMERIC", "Formula did not evaluate to a number")
    if value != value:  # NaN
        raise FormulaError("NAN_RESULT", "Formula evaluated to NaN")
    if math.isinf(value):
        raise FormulaError("OVERFLOW", "Formula result is too large")
    return float(value)


def _assert_allowed(node: ast.AST) -> None:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise FormulaError("UNSUPPORTED_LITERAL", "Only numeric literals are allowed")
        return
    if isinstance(node, ast.Name):
        if not isinstance(node.ctx, ast.Load):
            raise FormulaError("INVALID_FORMULA", "Invalid variable reference")
        return
    if isinstance(node, ast.BinOp):
        if type(node.op) not in ALLOWED_BINOPS:
            raise FormulaError("UNSUPPORTED_OPERATOR", "Unsupported binary operator")
        _assert_allowed(node.left)
        _assert_allowed(node.right)
        return
    if isinstance(node, ast.UnaryOp):
        if type(node.op) not in ALLOWED_UNARY:
            raise FormulaError("UNSUPPORTED_OPERATOR", "Unsupported unary operator")
        _assert_allowed(node.operand)
        return
    if isinstance(node, ast.Call):
        _assert_allowed_call(node)
        return
    if isinstance(node, ast.Expression):
        _assert_allowed(node.body)
        return
    raise FormulaError(
        "UNSUPPORTED_SYNTAX",
        f"Unsupported syntax: {type(node).__name__}",
    )


def _assert_allowed_call(node: ast.Call) -> None:
    if not isinstance(node.func, ast.Name):
        raise FormulaError("UNSUPPORTED_SYNTAX", "Only Excel-style function names are allowed")
    if node.keywords:
        raise FormulaError("UNSUPPORTED_SYNTAX", "Keyword arguments are not allowed")
    if any(isinstance(arg, ast.Starred) for arg in node.args):
        raise FormulaError("UNSUPPORTED_SYNTAX", "Star arguments are not allowed")
    name = node.func.id.upper()
    spec = FORMULA_FUNCTIONS.get(name)
    if spec is None:
        raise FormulaError("UNKNOWN_FUNCTION", f"Unknown function {node.func.id}")
    min_args, max_args, _impl = spec
    count = len(node.args)
    if count < min_args or (max_args is not None and count > max_args):
        raise FormulaError(
            "WRONG_ARITY",
            f"{name} expected { _arity_label(min_args, max_args) } argument(s), got {count}",
        )
    for arg in node.args:
        _assert_allowed(arg)


def _arity_label(min_args: int, max_args: int | None) -> str:
    if max_args is None:
        return f"{min_args}+"
    if min_args == max_args:
        return str(min_args)
    return f"{min_args}–{max_args}"


def _eval_node(node: ast.AST, env: dict[str, float]) -> float:
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        return env[node.id]
    if isinstance(node, ast.UnaryOp):
        op = ALLOWED_UNARY[type(node.op)]
        return float(op(_eval_node(node.operand, env)))  # type: ignore[operator]
    if isinstance(node, ast.BinOp):
        op = ALLOWED_BINOPS[type(node.op)]
        left = _eval_node(node.left, env)
        right = _eval_node(node.right, env)
        try:
            return float(op(left, right))  # type: ignore[operator]
        except ZeroDivisionError as exc:
            raise FormulaError("DIVISION_BY_ZERO", "Division by zero") from exc
    if isinstance(node, ast.Call):
        return _eval_call(node, env)
    raise FormulaError("UNSUPPORTED_SYNTAX", f"Unsupported syntax: {type(node).__name__}")


def _eval_call(node: ast.Call, env: dict[str, float]) -> float:
    assert isinstance(node.func, ast.Name)
    name = node.func.id.upper()
    _min_args, _max_args, impl = FORMULA_FUNCTIONS[name]
    args = [_eval_node(arg, env) for arg in node.args]
    try:
        value = impl(*args)
    except FormulaError:
        raise
    except OverflowError as exc:
        raise FormulaError("OVERFLOW", "Formula result is too large") from exc
    except ValueError as exc:
        raise FormulaError("DOMAIN_ERROR", f"{name} is not defined for these arguments") from exc
    except ZeroDivisionError as exc:
        raise FormulaError("DIVISION_BY_ZERO", "Division by zero") from exc
    return float(value)


def names_in(formulas: Iterable[str]) -> set[str]:
    found: set[str] = set()
    for formula in formulas:
        found.update(referenced_names(formula))
    return found


def rewrite_identifier(formula: str, from_id: str, to_id: str) -> str:
    """Replace a variable ID in a formula without touching longer names (PIN vs PIN2)."""
    if not from_id or from_id == to_id:
        return formula
    pattern = re.compile(rf"(^|[^\w]){re.escape(from_id)}(?![\w])")
    return pattern.sub(lambda match: f"{match.group(1)}{to_id}", formula)
