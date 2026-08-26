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
    if isinstance(node, ast.BinOp):
        left = _infer_dim(node.left, quantity_env)
        right = _infer_dim(node.right, quantity_env)
        if isinstance(node.op, (ast.Add, ast.Sub, ast.Mod)):
            if left is None or right is None:
                return None
            if left != right:
                raise QuantityError("QUANTITY_MISMATCH", "Add/subtract requires the same quantity")
            return left
        if isinstance(node.op, ast.Mult):
            if left is None or right is None:
                return None
            return left.mul(right)
        if isinstance(node.op, ast.Div):
            if left is None or right is None:
                return None
            return left.div(right)
        if isinstance(node.op, ast.Pow):
            if left is None:
                return None
            if not isinstance(node.right, ast.Constant) or isinstance(node.right.value, bool):
                return None
            exponent = node.right.value
            if not isinstance(exponent, (int, float)) or exponent != int(exponent):
                if left != DIMENSIONLESS:
                    raise QuantityError("QUANTITY_MISMATCH", "Non-integer power is only allowed for dimensionless values")
                return DIMENSIONLESS
            return left.pow(int(exponent))
    return None
