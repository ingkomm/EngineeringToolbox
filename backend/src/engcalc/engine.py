from __future__ import annotations

import re
from collections import defaultdict, deque

from engcalc.formulas import FormulaError, evaluate_formula, referenced_names
from engcalc.models import (
    CalculationObject,
    Edge,
    EvalError,
    EvaluateResponse,
    FormulaVariable,
    InputVariable,
    OutputBinding,
    ProjectDocument,
)

VARIABLE_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def evaluate_project(
    project: ProjectDocument,
    dirty_object_ids: list[str] | None = None,
) -> EvaluateResponse:
    """Deterministic project evaluation. Safe to call without a GUI."""
    working = project.model_copy(deep=True)
    errors: list[EvalError] = []

    objects_by_id = {obj.id: obj for obj in working.objects}
    if len(objects_by_id) != len(working.objects):
        errors.append(
            EvalError(code="DUPLICATE_OBJECT_ID", message="Duplicate calculation object id")
        )
        return EvaluateResponse(project=working, evaluatedObjectIds=[], errors=errors)

    structural = _validate_structure(working)
    errors.extend(structural)
    if any(err.code in {"DUPLICATE_VARIABLE_ID", "INVALID_VARIABLE_ID"} for err in structural):
        return EvaluateResponse(project=working, evaluatedObjectIds=[], errors=errors)

    try:
        object_graph = _object_adjacency(working)
        order = _topological_sort(list(objects_by_id), object_graph)
    except GraphError as exc:
        errors.append(EvalError(code=exc.code, message=exc.message))
        return EvaluateResponse(project=working, evaluatedObjectIds=[], errors=errors)

    affected = _affected_object_ids(order, object_graph, dirty_object_ids)
    evaluated: list[str] = []

    inbound = _inbound_edges(working.edges)

    for object_id in order:
        if object_id not in affected:
            continue
        obj = objects_by_id[object_id]
        obj_errors = _evaluate_object(obj, objects_by_id, inbound.get(object_id, []))
        errors.extend(obj_errors)
        evaluated.append(object_id)

    return EvaluateResponse(
        project=working,
        evaluatedObjectIds=evaluated,
        errors=errors,
    )


class GraphError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _validate_structure(project: ProjectDocument) -> list[EvalError]:
    errors: list[EvalError] = []
    object_ids = {obj.id for obj in project.objects}

    for obj in project.objects:
        seen: set[str] = set()
        for variable in _all_named_variables(obj):
            if not VARIABLE_ID_RE.match(variable):
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=variable,
                        code="INVALID_VARIABLE_ID",
                        message=f"Variable id must be semantic (e.g. FLOW), not a cell address: {variable}",
                    )
                )
            if variable in seen:
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=variable,
                        code="DUPLICATE_VARIABLE_ID",
                        message=f"Variable id {variable} is not unique inside {obj.id}",
                    )
                )
            seen.add(variable)

        local_ids = {item.id for item in obj.inputs} | {item.id for item in obj.calculations}
        output_ids = [output.id for output in obj.outputs]
        if len(output_ids) != len(set(output_ids)):
            errors.append(
                EvalError(
                    objectId=obj.id,
                    code="DUPLICATE_OUTPUT_PORT",
                    message=f"Output port ids must be unique inside {obj.id}",
                )
            )
        for output in obj.outputs:
            if output.sourceVariableId not in local_ids:
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=output.id,
                        code="UNKNOWN_OUTPUT_SOURCE",
                        message=(
                            f"Output {output.id} references unknown source {output.sourceVariableId}"
                        ),
                    )
                )

    occupied_targets: dict[tuple[str, str], str] = {}
    for edge in project.edges:
        if edge.sourceObjectId not in object_ids:
            errors.append(
                EvalError(
                    objectId=edge.sourceObjectId,
                    code="UNKNOWN_OBJECT",
                    message=f"Edge {edge.id} source object does not exist",
                )
            )
            continue
        if edge.targetObjectId not in object_ids:
            errors.append(
                EvalError(
                    objectId=edge.targetObjectId,
                    code="UNKNOWN_OBJECT",
                    message=f"Edge {edge.id} target object does not exist",
                )
            )
            continue
        source = next(obj for obj in project.objects if obj.id == edge.sourceObjectId)
        target = next(obj for obj in project.objects if obj.id == edge.targetObjectId)
        if not any(item.id == edge.sourceVariableId for item in source.outputs):
            errors.append(
                EvalError(
                    objectId=edge.sourceObjectId,
                    variableId=edge.sourceVariableId,
                    code="UNKNOWN_OUTPUT_PORT",
                    message=f"Edge {edge.id} source is not an output port",
                )
            )
        if not any(item.id == edge.targetVariableId for item in target.inputs):
            errors.append(
                EvalError(
                    objectId=edge.targetObjectId,
                    variableId=edge.targetVariableId,
                    code="UNKNOWN_INPUT_PORT",
                    message=f"Edge {edge.id} target is not an input port",
                )
            )
        key = (edge.targetObjectId, edge.targetVariableId)
        if key in occupied_targets:
            errors.append(
                EvalError(
                    objectId=edge.targetObjectId,
                    variableId=edge.targetVariableId,
                    code="FAN_IN_CONFLICT",
                    message=f"Input {edge.targetVariableId} already has a mapping",
                )
            )
        occupied_targets[key] = edge.id

    return errors


def _all_named_variables(obj: CalculationObject) -> list[str]:
    names = [item.id for item in obj.inputs] + [item.id for item in obj.calculations]
    return names


def _object_adjacency(project: ProjectDocument) -> dict[str, set[str]]:
    graph: dict[str, set[str]] = {obj.id: set() for obj in project.objects}
    for edge in project.edges:
        if edge.sourceObjectId in graph and edge.targetObjectId in graph:
            if edge.sourceObjectId == edge.targetObjectId:
                raise GraphError(
                    "CYCLE_DETECTED",
                    f"Self-mapping is not allowed on {edge.sourceObjectId}",
                )
            graph[edge.sourceObjectId].add(edge.targetObjectId)
    return graph


def _topological_sort(nodes: list[str], graph: dict[str, set[str]]) -> list[str]:
    incoming: dict[str, int] = {node: 0 for node in nodes}
    for src, destinations in graph.items():
        for dest in destinations:
            incoming[dest] += 1
    queue = deque(sorted(node for node, count in incoming.items() if count == 0))
    ordered: list[str] = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for dest in sorted(graph.get(node, set())):
            incoming[dest] -= 1
            if incoming[dest] == 0:
                queue.append(dest)
    if len(ordered) != len(nodes):
        raise GraphError("CYCLE_DETECTED", "Cycle in calculation object mapping graph")
    return ordered


def _affected_object_ids(
    order: list[str],
    graph: dict[str, set[str]],
    dirty_object_ids: list[str] | None,
) -> set[str]:
    if not dirty_object_ids:
        return set(order)
    known = set(order)
    unknown = [item for item in dirty_object_ids if item not in known]
    seeds = [item for item in dirty_object_ids if item in known]
    affected: set[str] = set(seeds)
    stack = list(seeds)
    while stack:
        node = stack.pop()
        for dest in graph.get(node, set()):
            if dest not in affected:
                affected.add(dest)
                stack.append(dest)
    # unknown dirty ids are ignored for traversal; caller still evaluates known seeds
    _ = unknown
    return affected


def _inbound_edges(edges: list[Edge]) -> dict[str, list[Edge]]:
    grouped: dict[str, list[Edge]] = defaultdict(list)
    for edge in edges:
        grouped[edge.targetObjectId].append(edge)
    return grouped


def _evaluate_object(
    obj: CalculationObject,
    objects_by_id: dict[str, CalculationObject],
    inbound: list[Edge],
) -> list[EvalError]:
    errors: list[EvalError] = []
    inputs_by_id = {item.id: item for item in obj.inputs}
    calculations_by_id = {item.id: item for item in obj.calculations}

    mapped_targets = {edge.targetVariableId for edge in inbound}
    for edge in inbound:
        target = inputs_by_id.get(edge.targetVariableId)
        if target is None:
            continue
        source_obj = objects_by_id.get(edge.sourceObjectId)
        if source_obj is None:
            _mark_input_error(target, "UNKNOWN_OBJECT", "Mapped source object is missing")
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=target.id,
                    code="UNKNOWN_OBJECT",
                    message="Mapped source object is missing",
                )
            )
            continue
        source_output = next(
            (item for item in source_obj.outputs if item.id == edge.sourceVariableId),
            None,
        )
        if source_output is None or source_output.value is None:
            _mark_input_error(
                target,
                "UNRESOLVED_MAPPING",
                f"Mapped source {edge.sourceObjectId}.{edge.sourceVariableId} has no value",
            )
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=target.id,
                    code="UNRESOLVED_MAPPING",
                    message=f"Mapped source {edge.sourceObjectId}.{edge.sourceVariableId} has no value",
                )
            )
            continue
        target.value = source_output.value
        target.status = "mapped"
        target.error = None

    for item in obj.inputs:
        if item.id not in mapped_targets:
            if item.value is None:
                item.status = "error"
                item.error = "Input has no value"
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=item.id,
                        code="MISSING_INPUT",
                        message=f"Input {item.id} has no value",
                    )
                )
            else:
                item.status = "ok"
                item.error = None

    env: dict[str, float] = {
        item.id: item.value for item in obj.inputs if item.value is not None
    }

    try:
        calc_order = _formula_order(obj.calculations)
    except GraphError as exc:
        for item in obj.calculations:
            item.status = "error"
            item.error = exc.message
            item.value = None
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=item.id,
                    code=exc.code,
                    message=exc.message,
                )
            )
        _fail_outputs(obj)
        return errors

    for item in calc_order:
        try:
            names = referenced_names(item.formula)
            unknown = [name for name in names if name not in env and name not in calculations_by_id]
            if unknown:
                raise FormulaError(
                    "UNRESOLVED_NAME",
                    f"Unresolved variables: {', '.join(sorted(set(unknown)))}",
                )
            unresolved_local = [name for name in names if name not in env]
            if unresolved_local:
                raise FormulaError(
                    "UNRESOLVED_NAME",
                    f"Unresolved variables: {', '.join(sorted(set(unresolved_local)))}",
                )
            item.value = evaluate_formula(item.formula, env)
            item.status = "ok"
            item.error = None
            env[item.id] = item.value
        except FormulaError as exc:
            item.value = None
            item.status = "error"
            item.error = exc.message
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=item.id,
                    code=exc.code,
                    message=exc.message,
                )
            )

    local_values: dict[str, tuple[float | None, str | None]] = {}
    for item in obj.inputs:
        local_values[item.id] = (item.value, item.unit)
    for item in obj.calculations:
        local_values[item.id] = (item.value, item.unit)

    for output in obj.outputs:
        source_value, source_unit = local_values.get(output.sourceVariableId, (None, None))
        if output.sourceVariableId not in local_values:
            output.value = None
            output.status = "error"
            output.error = f"Unknown source variable {output.sourceVariableId}"
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=output.id,
                    code="UNKNOWN_OUTPUT_SOURCE",
                    message=output.error,
                )
            )
            continue
        if source_value is None:
            output.value = None
            output.status = "error"
            output.error = f"Source {output.sourceVariableId} has no value"
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=output.id,
                    code="UNRESOLVED_OUTPUT",
                    message=output.error,
                )
            )
            continue
        output.value = source_value
        output.unit = output.unit or source_unit
        output.status = "ok"
        output.error = None

    return errors


def _formula_order(calculations: list[FormulaVariable]) -> list[FormulaVariable]:
    ids = {item.id for item in calculations}
    by_id = {item.id: item for item in calculations}
    graph: dict[str, set[str]] = {item.id: set() for item in calculations}
    for item in calculations:
        try:
            names = referenced_names(item.formula)
        except FormulaError:
            continue
        for name in names:
            if name in ids and name != item.id:
                graph[name].add(item.id)
            if name == item.id:
                raise GraphError("CYCLE_DETECTED", f"Formula {item.id} references itself")
    order_ids = _topological_sort(list(ids), graph)
    return [by_id[item_id] for item_id in order_ids]


def _mark_input_error(item: InputVariable, _code: str, message: str) -> None:
    item.value = None
    item.status = "error"
    item.error = message


def _fail_outputs(obj: CalculationObject) -> None:
    for output in obj.outputs:
        output.value = None
        output.status = "error"
        output.error = "Object calculation failed"
