"""Safe formula parser/evaluator. No eval(), no cell addresses."""

from __future__ import annotations

import ast
import operator
import re
from typing import Iterable

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


def parse_expression(formula: str) -> ast.Expression:
    text = formula.strip()
    if not text:
        raise FormulaError("EMPTY_FORMULA", "Formula is empty")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise FormulaError("INVALID_FORMULA", f"Invalid formula: {formula}") from exc
    _assert_allowed(tree.body)
    return tree


def referenced_names(formula: str) -> list[str]:
    tree = parse_expression(formula)
    names = sorted({node.id for node in ast.walk(tree) if isinstance(node, ast.Name)})
    return names


def evaluate_formula(formula: str, env: dict[str, float]) -> float:
    tree = parse_expression(formula)
    names = [node.id for node in ast.walk(tree) if isinstance(node, ast.Name)]
    missing = [name for name in names if name not in env]
    if missing:
        unique = ", ".join(sorted(set(missing)))
        raise FormulaError("UNRESOLVED_NAME", f"Unresolved variables: {unique}")
    value = _eval_node(tree.body, env)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FormulaError("NON_NUMERIC", "Formula did not evaluate to a number")
    if value != value:  # NaN
        raise FormulaError("NAN_RESULT", "Formula evaluated to NaN")
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
    if isinstance(node, ast.Expression):
        _assert_allowed(node.body)
        return
    raise FormulaError(
        "UNSUPPORTED_SYNTAX",
        f"Unsupported syntax: {type(node).__name__}",
    )


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
    raise FormulaError("UNSUPPORTED_SYNTAX", f"Unsupported syntax: {type(node).__name__}")


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
