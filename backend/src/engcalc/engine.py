from __future__ import annotations

from collections import defaultdict, deque

from engcalc.formulas import FormulaError, evaluate_formula, referenced_names, rewrite_identifier
from engcalc.models import (
    CalculationObject,
    Edge,
    EvalError,
    EvaluateResponse,
    FormulaVariable,
    InputVariable,
    OBJECT_ID_RE,
    OutputBinding,
    ProjectDocument,
    VARIABLE_ID_RE,
    is_calculation_object,
    is_layout_object,
    is_memo_object,
    is_point_object,
    is_value_flow_edge,
    layout_port_ids,
)
from engcalc.quantities import QuantityError, infer_formula_quantity, is_known_quantity, si_unit_for


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
    if any(
        err.code
        in {
            "DUPLICATE_VARIABLE_ID",
            "DUPLICATE_VARIABLE_NAME",
            "INVALID_VARIABLE_ID",
            "DUPLICATE_OBJECT_NAME",
            "INVALID_OBJECT_ID",
        }
        for err in structural
    ):
        return EvaluateResponse(project=working, evaluatedObjectIds=[], errors=errors)

    calculation_ids = [obj.id for obj in working.objects if is_calculation_object(obj)]
    try:
        object_graph = _object_adjacency(working)
        order = _topological_sort(calculation_ids, object_graph)
    except GraphError as exc:
        errors.append(EvalError(code=exc.code, message=exc.message))
        return EvaluateResponse(project=working, evaluatedObjectIds=[], errors=errors)

    affected = _affected_object_ids(order, object_graph, dirty_object_ids)
    evaluated: list[str] = []

    inbound = _inbound_edges(working.edges)
    calc_by_id = {obj.id: obj for obj in working.objects if is_calculation_object(obj)}

    for object_id in order:
        if object_id not in affected:
            continue
        obj = calc_by_id[object_id]
        obj_errors = _evaluate_object(obj, calc_by_id, inbound.get(object_id, []))
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

    seen_object_names: dict[str, str] = {}
    for obj in project.objects:
        if is_memo_object(obj):
            continue
        if not OBJECT_ID_RE.match(obj.id):
            errors.append(
                EvalError(
                    objectId=obj.id,
                    code="INVALID_OBJECT_ID",
                    message=f"Object id must be semantic (e.g. obj_1), not a cell address: {obj.id}",
                )
            )
        name_key = obj.name.strip()
        if name_key:
            previous = seen_object_names.get(name_key)
            if previous:
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        code="DUPLICATE_OBJECT_NAME",
                        message=f"Object name '{name_key}' is already used by {previous}. Object names are unique.",
                    )
                )
            else:
                seen_object_names[name_key] = obj.id

    mapped_keys = {
        (edge.targetObjectId, edge.targetVariableId)
        for edge in project.edges
        if edge.enabled and is_value_flow_edge(edge)
    }
    seen_ids: dict[str, tuple[str, str]] = {}
    seen_names: dict[str, tuple[str, str]] = {}

    for obj in project.objects:
        if is_layout_object(obj) or is_memo_object(obj):
            continue
        local_seen: set[str] = set()
        owned: list[tuple[str, str, str]] = []
        for item in obj.calculations:
            owned.append((item.id, item.name, "calculation"))
        for item in obj.inputs:
            if (obj.id, item.id) not in mapped_keys:
                owned.append((item.id, item.name, "input"))

        for variable_id, variable_name, _kind in owned:
            if not VARIABLE_ID_RE.match(variable_id):
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=variable_id,
                        code="INVALID_VARIABLE_ID",
                        message=f"Variable id must be semantic (e.g. FLOW), not a cell address: {variable_id}",
                    )
                )
            if variable_id in local_seen:
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=variable_id,
                        code="DUPLICATE_VARIABLE_ID",
                        message=f"Variable id {variable_id} is not unique inside {obj.id}",
                    )
                )
            local_seen.add(variable_id)
            previous = seen_ids.get(variable_id)
            if previous:
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=variable_id,
                        code="DUPLICATE_VARIABLE_ID",
                        message=(
                            f"Variable id {variable_id} is already defined on {previous[0]} "
                            f"({previous[1]}). IDs are global."
                        ),
                    )
                )
            else:
                seen_ids[variable_id] = (obj.id, variable_name)
            name_key = variable_name.strip()
            if name_key:
                previous_name = seen_names.get(name_key)
                if previous_name and previous_name[1] != variable_id:
                    errors.append(
                        EvalError(
                            objectId=obj.id,
                            variableId=variable_id,
                            code="DUPLICATE_VARIABLE_NAME",
                            message=(
                                f"Variable name '{name_key}' is already used by {previous_name[0]}.{previous_name[1]}. "
                                "Names are global."
                            ),
                        )
                    )
                elif not previous_name:
                    seen_names[name_key] = (obj.id, variable_id)

        for item in [*obj.inputs, *obj.calculations, *obj.outputs]:
            if item.quantity and not is_known_quantity(item.quantity):
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=item.id,
                        code="UNKNOWN_QUANTITY",
                        message=f"Unknown quantity {item.quantity}",
                    )
                )

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
    occupied_sources: dict[tuple[str, str], str] = {}
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
        if is_value_flow_edge(edge):
            if is_layout_object(source) or is_layout_object(target):
                errors.append(
                    EvalError(
                        objectId=source.id if is_layout_object(source) else target.id,
                        variableId=edge.sourceVariableId
                        if is_layout_object(source)
                        else edge.targetVariableId,
                        code="ARRANGEMENT_HAS_NO_VALUE",
                        message=(
                            f"Edge {edge.id} cannot use value_flow with Equipment or Point. "
                            "They do not calculate values; use association or reference."
                        ),
                    )
                )
                continue
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
            source_key = (edge.sourceObjectId, edge.sourceVariableId)
            if source_key in occupied_sources:
                errors.append(
                    EvalError(
                        objectId=edge.sourceObjectId,
                        variableId=edge.sourceVariableId,
                        code="FAN_OUT_CONFLICT",
                        message=(
                            f"Output {edge.sourceVariableId} is already mapped to another input"
                        ),
                    )
                )
            occupied_sources[source_key] = edge.id
            continue

        if not _has_source_endpoint(source, edge.sourceVariableId):
            errors.append(
                EvalError(
                    objectId=edge.sourceObjectId,
                    variableId=edge.sourceVariableId,
                    code="UNKNOWN_POINT" if is_layout_object(source) else "UNKNOWN_OUTPUT_PORT",
                    message=f"Edge {edge.id} source port/point does not exist",
                )
            )
        if not _has_target_endpoint(target, edge.targetVariableId):
            errors.append(
                EvalError(
                    objectId=edge.targetObjectId,
                    variableId=edge.targetVariableId,
                    code="UNKNOWN_POINT" if is_layout_object(target) else "UNKNOWN_INPUT_PORT",
                    message=f"Edge {edge.id} target port/point does not exist",
                )
            )

    return errors


def _has_source_endpoint(obj: CalculationObject | object, port_id: str) -> bool:
    if is_layout_object(obj):
        return port_id in layout_port_ids(obj)
    return any(item.id == port_id for item in obj.outputs) or any(item.id == port_id for item in obj.links)


def _has_target_endpoint(obj: CalculationObject | object, port_id: str) -> bool:
    if is_layout_object(obj):
        return port_id in layout_port_ids(obj)
    return any(item.id == port_id for item in obj.inputs)


def _object_adjacency(project: ProjectDocument) -> dict[str, set[str]]:
    graph: dict[str, set[str]] = {
        obj.id: set() for obj in project.objects if is_calculation_object(obj)
    }
    for edge in project.edges:
        if not is_value_flow_edge(edge):
            continue
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
        if not is_value_flow_edge(edge):
            continue
        grouped[edge.targetObjectId].append(edge)
    return grouped


def _align_mapped_identities(
    obj: CalculationObject,
    objects_by_id: dict[str, CalculationObject],
    active_inbound: list[Edge],
) -> None:
    """Mapped inputs inherit the source variable's global id and name."""
    for edge in active_inbound:
        target = next((item for item in obj.inputs if item.id == edge.targetVariableId), None)
        source_obj = objects_by_id.get(edge.sourceObjectId)
        if target is None or source_obj is None:
            continue
        source_output = next((item for item in source_obj.outputs if item.id == edge.sourceVariableId), None)
        if source_output is None:
            continue
        old_id = target.id
        new_id = source_output.id
        target.id = new_id
        target.name = source_output.name or source_output.id
        _inherit_source_quantity(target, source_obj, source_output)
        edge.targetVariableId = new_id
        if old_id == new_id:
            continue
        for calc in obj.calculations:
            calc.formula = rewrite_identifier(calc.formula, old_id, new_id)
        for output in obj.outputs:
            if output.id == old_id:
                output.id = new_id
            if output.sourceVariableId == old_id:
                output.sourceVariableId = new_id
            if not output.name or output.name == old_id:
                output.name = target.name


def _inherit_source_quantity(
    target: InputVariable,
    source_obj: CalculationObject,
    source_output: OutputBinding,
) -> None:
    """Mapped inputs always follow the upstream quantity/unit, including later changes."""
    quantity, unit = _source_quantity_unit(source_obj, source_output)
    target.quantity = quantity
    target.unit = unit


def _source_quantity_unit(
    source_obj: CalculationObject,
    source_output: OutputBinding,
) -> tuple[str | None, str | None]:
    source_var = next(
        (
            item
            for item in [*source_obj.inputs, *source_obj.calculations]
            if item.id in {source_output.sourceVariableId, source_output.id}
        ),
        None,
    )
    quantity = source_var.quantity if source_var is not None else source_output.quantity
    if quantity is None:
        quantity = source_output.quantity
    unit = source_var.unit if source_var is not None and source_var.unit is not None else source_output.unit
    if unit is None:
        unit = si_unit_for(quantity)
    return quantity, unit


def _evaluate_object(
    obj: CalculationObject,
    objects_by_id: dict[str, CalculationObject],
    inbound: list[Edge],
) -> list[EvalError]:
    errors: list[EvalError] = []
    calculations_by_id = {item.id: item for item in obj.calculations}

    for item in obj.inputs:
        if item.quantity:
            item.unit = si_unit_for(item.quantity)

    active_inbound = [edge for edge in inbound if edge.enabled]
    _align_mapped_identities(obj, objects_by_id, active_inbound)

    inputs_by_id = {item.id: item for item in obj.inputs}
    mapped_targets = {edge.targetVariableId for edge in active_inbound}
    for edge in active_inbound:
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
        if source_output is None:
            _mark_input_error(target, "UNKNOWN_OUTPUT_PORT", "Mapped source port is missing")
            errors.append(
                EvalError(
                    objectId=obj.id,
                    variableId=target.id,
                    code="UNKNOWN_OUTPUT_PORT",
                    message="Mapped source port is missing",
                )
            )
            continue
        _inherit_source_quantity(target, source_obj, source_output)
        target.name = source_output.name or source_output.id
        if source_output.value is None:
            target.value = None
            target.status = "idle" if source_output.status != "error" else "error"
            target.error = None if target.status == "idle" else "Mapped source has no value"
            if target.status == "error":
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
                item.status = "idle"
                item.error = None
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

    qty_env: dict[str, str | None] = {item.id: item.quantity for item in obj.inputs}

    for item in calc_order:
        if not item.formula.strip():
            item.value = None
            item.quantity = None
            item.unit = None
            item.status = "idle"
            item.error = None
            continue
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
            try:
                quantity_id, unit = infer_formula_quantity(item.formula, qty_env)
                item.quantity = quantity_id
                item.unit = unit
                item.status = "ok"
                item.error = None
            except QuantityError as exc:
                item.quantity = None
                item.unit = None
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
            env[item.id] = item.value
            qty_env[item.id] = item.quantity
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

    local_meta: dict[str, tuple[float | None, str | None, str | None, str, str]] = {}
    for item in obj.inputs:
        local_meta[item.id] = (item.value, item.unit, item.quantity, item.status, item.name)
    for item in obj.calculations:
        local_meta[item.id] = (item.value, item.unit, item.quantity, item.status, item.name)

    for output in obj.outputs:
        if not output.sourceVariableId:
            output.value = None
            output.status = "idle"
            output.error = None
            continue
        if output.sourceVariableId not in local_meta:
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
        source_value, source_unit, source_quantity, source_status, source_name = local_meta[output.sourceVariableId]
        output.quantity = source_quantity
        output.unit = source_unit
        output.name = source_name
        if source_value is None:
            output.value = None
            output.status = "error" if source_status == "error" else "idle"
            output.error = None if output.status == "idle" else f"Source {output.sourceVariableId} has no value"
            if output.status == "error":
                errors.append(
                    EvalError(
                        objectId=obj.id,
                        variableId=output.id,
                        code="UNRESOLVED_OUTPUT",
                        message=output.error or "",
                    )
                )
            continue
        output.value = source_value
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
