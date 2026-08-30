"""SI quantity catalog and formula quantity inference. Lives in Python only."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import TypedDict


class QuantitySpec(TypedDict):
    id: str
    nameKo: str
    nameEn: str
    siUnit: str


class QuantityError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Dim:
    M: int = 0
    L: int = 0
    T: int = 0
    Theta: int = 0

    def mul(self, other: Dim) -> Dim:
        return Dim(self.M + other.M, self.L + other.L, self.T + other.T, self.Theta + other.Theta)

    def div(self, other: Dim) -> Dim:
        return Dim(self.M - other.M, self.L - other.L, self.T - other.T, self.Theta - other.Theta)

    def pow(self, exponent: int) -> Dim:
        return Dim(self.M * exponent, self.L * exponent, self.T * exponent, self.Theta * exponent)

    def can_sqrt(self) -> bool:
        return all(value % 2 == 0 for value in (self.M, self.L, self.T, self.Theta))

    def sqrt(self) -> Dim:
        return Dim(self.M // 2, self.L // 2, self.T // 2, self.Theta // 2)


QUANTITIES: tuple[QuantitySpec, ...] = (
    {"id": "pressure", "nameKo": "압력", "nameEn": "Pressure", "siUnit": "Pa"},
    {"id": "temperature", "nameKo": "온도", "nameEn": "Temperature", "siUnit": "K"},
    {"id": "enthalpy", "nameKo": "엔탈피", "nameEn": "Specific enthalpy", "siUnit": "J/kg"},
    {"id": "mass_flow", "nameKo": "질량유량", "nameEn": "Mass flow", "siUnit": "kg/s"},
    {"id": "volume_flow", "nameKo": "체적유량", "nameEn": "Volume flow", "siUnit": "m3/s"},
    {"id": "length", "nameKo": "길이", "nameEn": "Length", "siUnit": "m"},
    {"id": "mass", "nameKo": "질량", "nameEn": "Mass", "siUnit": "kg"},
    {"id": "time", "nameKo": "시간", "nameEn": "Time", "siUnit": "s"},
    {"id": "power", "nameKo": "동력", "nameEn": "Power", "siUnit": "W"},
    {"id": "energy", "nameKo": "에너지", "nameEn": "Energy", "siUnit": "J"},
    {"id": "density", "nameKo": "밀도", "nameEn": "Density", "siUnit": "kg/m3"},
    {"id": "area", "nameKo": "면적", "nameEn": "Area", "siUnit": "m2"},
    {"id": "volume", "nameKo": "체적", "nameEn": "Volume", "siUnit": "m3"},
    {"id": "velocity", "nameKo": "속도", "nameEn": "Velocity", "siUnit": "m/s"},
    {"id": "dimensionless", "nameKo": "무차원", "nameEn": "Dimensionless", "siUnit": "1"},
)

QUANTITY_BY_ID: dict[str, QuantitySpec] = {item["id"]: item for item in QUANTITIES}

DIMENSIONLESS = Dim()

QUANTITY_DIM: dict[str, Dim] = {
    "pressure": Dim(M=1, L=-1, T=-2),
    "temperature": Dim(Theta=1),
    "enthalpy": Dim(L=2, T=-2),
    "mass_flow": Dim(M=1, T=-1),
    "volume_flow": Dim(L=3, T=-1),
    "length": Dim(L=1),
    "mass": Dim(M=1),
    "time": Dim(T=1),
    "power": Dim(M=1, L=2, T=-3),
    "energy": Dim(M=1, L=2, T=-2),
    "density": Dim(M=1, L=-3),
    "area": Dim(L=2),
    "volume": Dim(L=3),
    "velocity": Dim(L=1, T=-1),
    "dimensionless": DIMENSIONLESS,
}

DIM_TO_QUANTITY: dict[Dim, str] = {dim: quantity_id for quantity_id, dim in QUANTITY_DIM.items()}


def si_unit_for(quantity_id: str | None) -> str | None:
    if not quantity_id:
        return None
    spec = QUANTITY_BY_ID.get(quantity_id)
    return spec["siUnit"] if spec else None


def is_known_quantity(quantity_id: str | None) -> bool:
    return quantity_id is None or quantity_id in QUANTITY_BY_ID


def format_dim_unit(dim: Dim) -> str:
    if dim == DIMENSIONLESS:
        return "1"
    parts_pos: list[str] = []
    parts_neg: list[str] = []
    for symbol, exponent in (("kg", dim.M), ("m", dim.L), ("s", dim.T), ("K", dim.Theta)):
        if exponent > 0:
            parts_pos.append(symbol if exponent == 1 else f"{symbol}{exponent}")
        elif exponent < 0:
            mag = -exponent
            parts_neg.append(symbol if mag == 1 else f"{symbol}{mag}")
    numerator = "·".join(parts_pos) if parts_pos else "1"
    if not parts_neg:
        return numerator
    denominator = "·".join(parts_neg)
    if len(parts_neg) == 1:
        return f"{numerator}/{denominator}"
    return f"{numerator}/({denominator})"


def infer_formula_quantity(
    formula: str,
    quantity_env: dict[str, str | None],
) -> tuple[str | None, str | None]:
    """Return (quantity_id, si_unit). quantity_id is None when only a derived unit is known."""
    from engcalc.formulas import parse_expression

    tree = parse_expression(formula)
    dim = _infer_dim(tree.body, quantity_env)
    if dim is None:
        return None, None
    quantity_id = DIM_TO_QUANTITY.get(dim)
    unit = si_unit_for(quantity_id) if quantity_id else format_dim_unit(dim)
    return quantity_id, unit


def _infer_dim(node: ast.AST, quantity_env: dict[str, str | None]) -> Dim | None:
    if isinstance(node, ast.Constant):
        return DIMENSIONLESS
    if isinstance(node, ast.Name):
        quantity_id = quantity_env.get(node.id)
        if not quantity_id:
            return None
        return QUANTITY_DIM.get(quantity_id)
    if isinstance(node, ast.UnaryOp):
        return _infer_dim(node.operand, quantity_env)
    if isinstance(node, ast.Call):
        return _infer_call_dim(node, quantity_env)
    if isinstance(node, ast.BinOp):
        left = _infer_dim(node.left, quantity_env)
        right = _infer_dim(node.right, quantity_env)
        if isinstance(node.op, (ast.Add, ast.Sub, ast.Mod)):
            return _combine_additive(node, left, right, quantity_env)
        if isinstance(node.op, ast.Mult):
            if left is None or right is None:
                return None
            return left.mul(right)
        if isinstance(node.op, ast.Div):
            if left is None or right is None:
                return None
            return left.div(right)
        if isinstance(node.op, ast.Pow):
            return _infer_power_dim(left, node.right, quantity_env)
    return None


def _infer_call_dim(node: ast.Call, quantity_env: dict[str, str | None]) -> Dim | None:
    if not isinstance(node.func, ast.Name):
        return None
    name = node.func.id.upper()
    args = node.args
    if name in {"LN", "LOG", "LOG10", "EXP"}:
        arg = _infer_dim(args[0], quantity_env) if args else None
        if arg is not None and arg != DIMENSIONLESS:
            raise QuantityError(
                "QUANTITY_MISMATCH",
                f"{name}는 무차원 값에만 사용할 수 있습니다",
            )
        return DIMENSIONLESS
    if name == "PI":
        return DIMENSIONLESS
    if name == "SIGN":
        return DIMENSIONLESS
    if name in {"ABS", "INT", "ROUND", "ROUNDDOWN", "ROUNDUP", "TRUNC"}:
        return _infer_dim(args[0], quantity_env) if args else None
    if name == "SQRT":
        arg = _infer_dim(args[0], quantity_env) if args else None
        if arg is None:
            return None
        if arg == DIMENSIONLESS:
            return DIMENSIONLESS
        if not arg.can_sqrt():
            return None
        return arg.sqrt()
    if name == "POWER":
        if len(args) < 2:
            return None
        return _infer_power_dim(_infer_dim(args[0], quantity_env), args[1], quantity_env)
    if name == "MOD":
        if len(args) < 2:
            return None
        dummy = ast.BinOp(left=args[0], op=ast.Mod(), right=args[1])
        return _combine_additive(
            dummy,
            _infer_dim(args[0], quantity_env),
            _infer_dim(args[1], quantity_env),
            quantity_env,
        )
    if name in {"MIN", "MAX"}:
        dims = [_infer_dim(arg, quantity_env) for arg in args]
        result = dims[0] if dims else None
        for index, dim in enumerate(dims[1:], start=1):
            dummy = ast.BinOp(left=args[0], op=ast.Add(), right=args[index])
            result = _combine_additive(dummy, result, dim, quantity_env)
        return result
    return None


def _infer_power_dim(left: Dim | None, exponent_node: ast.AST, quantity_env: dict[str, str | None]) -> Dim | None:
    if left is None:
        return None
    if not isinstance(exponent_node, ast.Constant) or isinstance(exponent_node.value, bool):
        return None
    exponent = exponent_node.value
    if not isinstance(exponent, (int, float)):
        return None
    if exponent != int(exponent):
        if left != DIMENSIONLESS:
            raise QuantityError(
                "QUANTITY_MISMATCH",
                "정수가 아닌 지수는 무차원 값에만 허용됩니다",
            )
        return DIMENSIONLESS
    return left.pow(int(exponent))


def _is_pure_number(node: ast.AST) -> bool:
    """True when the subtree is only numeric literals, Excel functions, and operators — no variable IDs."""
    from engcalc.formulas import _call_func_ids

    skip = _call_func_ids(node)
    return not any(isinstance(child, ast.Name) and id(child) not in skip for child in ast.walk(node))


def _combine_additive(
    node: ast.BinOp,
    left: Dim | None,
    right: Dim | None,
    quantity_env: dict[str, str | None],
) -> Dim | None:
    left_pure = _is_pure_number(node.left)
    right_pure = _is_pure_number(node.right)
    # Untyped numbers inherit the other operand's quantity (POUT - 12 → pressure).
    if left_pure and not right_pure:
        return right
    if right_pure and not left_pure:
        return left
    if left_pure and right_pure:
        return DIMENSIONLESS
    # Variable with no quantity inherits a known quantity on the other side.
    if left is None:
        return right
    if right is None:
        return left
    if left != right:
        raise QuantityError(
            "QUANTITY_MISMATCH",
            _mismatch_message(node, left, right, quantity_env),
        )
    return left


def _mismatch_message(
    node: ast.BinOp,
    left: Dim,
    right: Dim,
    quantity_env: dict[str, str | None],
) -> str:
    left_label = _side_label(node.left, left, quantity_env)
    right_label = _side_label(node.right, right, quantity_env)
    return (
        "덧셈/뺄셈 항의 단위가 서로 달라 하나의 물성으로 결합할 수 없습니다: "
        f"{left_label} 와(과) {right_label}"
    )


def _side_label(node: ast.AST, dim: Dim, quantity_env: dict[str, str | None]) -> str:
    from engcalc.formulas import _call_func_ids

    skip = _call_func_ids(node)
    names = [child.id for child in ast.walk(node) if isinstance(child, ast.Name) and id(child) not in skip]
    if names:
        parts: list[str] = []
        for name in names:
            quantity_id = quantity_env.get(name)
            spec = QUANTITY_BY_ID.get(quantity_id) if quantity_id else None
            if spec:
                parts.append(f"{name}({spec['nameKo']}/{spec['siUnit']})")
            else:
                parts.append(name)
        return ", ".join(parts)
    return _describe_dim(dim)


def _describe_dim(dim: Dim) -> str:
    quantity_id = DIM_TO_QUANTITY.get(dim)
    if quantity_id:
        spec = QUANTITY_BY_ID[quantity_id]
        return f"{spec['nameKo']}({spec['siUnit']})"
    return format_dim_unit(dim)
