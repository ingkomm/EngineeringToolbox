import type {
  CalculationLink,
  CalculationObject,
  FormulaVariable,
  InputVariable,
  OutputBinding,
} from "./types";
import type { ProjectDocument, RelationType } from "../shared/document";
import { noEval, type EditResult } from "../shared/editResult";
import { OBJECT_ID_RE, VARIABLE_ID_RE } from "../shared/identity";
import { snapCalcWidth } from "./cardWidth";
import { siUnitFor, type QuantitySpec } from "../shared/quantities";
import { displayName, identityTaken, nextGlobalPrefixedId, sourceVariable } from "./variables";
import {
  OBJECT_LINK_HANDLE,
  canConnectObjectLink,
  isCalculationObject,
  isLayoutObject,
  isValueFlowEdge,
  layoutPortExists,
} from "../shared/worksheet";
import { isMemoObject } from "../memo/memo";
import { nextObjectId, nextObjectName, objectIdentityTaken, rekeyObject } from "../shared/objectIdentity";

function patchObject(
  project: ProjectDocument,
  objectId: string,
  mutate: (object: CalculationObject) => CalculationObject,
): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => {
      if (object.id !== objectId || !isCalculationObject(object)) return object;
      return mutate(object);
    }),
  };
}

function rewriteIdentifier(formula: string, fromId: string, toId: string): string {
  if (!fromId || fromId === toId) return formula;
  const escaped = fromId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return formula.replace(new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g"), `$1${toId}`);
}

function rewriteFormulas(object: CalculationObject, fromId: string, toId: string): CalculationObject {
  if (fromId === toId) return object;
  return {
    ...object,
    calculations: object.calculations.map((item) => ({
      ...item,
      formula: rewriteIdentifier(item.formula, fromId, toId),
    })),
  };
}

export function syncObjectOutputs(object: CalculationObject): CalculationObject {
  const sources = [...object.inputs, ...object.calculations];
  const previousBySource = new Map(object.outputs.map((item) => [item.sourceVariableId, item]));
  const previousById = new Map(object.outputs.map((item) => [item.id, item]));
  return {
    ...object,
    links: object.links ?? [],
    outputs: sources.map((item) => {
      const prev = previousBySource.get(item.id) ?? previousById.get(item.id);
      return {
        id: item.id,
        name: displayName(item),
        sourceVariableId: item.id,
        value: prev?.value ?? item.value ?? null,
        quantity: item.quantity ?? prev?.quantity ?? null,
        unit: item.unit ?? prev?.unit ?? null,
        status: prev?.status,
        error: prev?.error ?? null,
      };
    }),
  };
}

function syncProjectObject(project: ProjectDocument, objectId: string): ProjectDocument {
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || !isCalculationObject(current)) return project;
  const next = patchObject(project, objectId, syncObjectOutputs);
  const object = next.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return next;
  const outputIds = new Set(object.outputs.map((item) => item.id));
  const inputIds = new Set(object.inputs.map((item) => item.id));
  return {
    ...next,
    edges: next.edges.filter((edge) => {
      if (edge.sourceObjectId === objectId && isValueFlowEdge(edge) && !outputIds.has(edge.sourceVariableId)) {
        return false;
      }
      if (edge.targetObjectId === objectId && isValueFlowEdge(edge) && !inputIds.has(edge.targetVariableId)) {
        return false;
      }
      return true;
    }),
  };
}

export function syncAllObjects(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => (isCalculationObject(object) ? syncObjectOutputs(object) : object)),
  };
}

function rekeyGlobalVariable(project: ProjectDocument, fromId: string, toId: string, nextName: string): ProjectDocument {
  const renamed: ProjectDocument = {
    ...project,
    objects: project.objects.map((object) => {
      if (!isCalculationObject(object)) return object;
      return {
        ...object,
        inputs: object.inputs.map((item) => (item.id === fromId ? { ...item, id: toId, name: nextName } : item)),
        calculations: object.calculations.map((item) => ({
          ...item,
          id: item.id === fromId ? toId : item.id,
          name: item.id === fromId ? nextName : item.name,
          formula: rewriteIdentifier(item.formula, fromId, toId),
        })),
      };
    }),
    edges: project.edges.map((edge) => ({
      ...edge,
      sourceVariableId: edge.sourceVariableId === fromId ? toId : edge.sourceVariableId,
      targetVariableId: edge.targetVariableId === fromId ? toId : edge.targetVariableId,
    })),
  };
  return syncAllObjects(renamed);
}

function applyDisplayName(project: ProjectDocument, variableId: string, nextName: string): ProjectDocument {
  return syncAllObjects({
    ...project,
    objects: project.objects.map((object) => {
      if (!isCalculationObject(object)) return object;
      return {
        ...object,
        inputs: object.inputs.map((item) => (item.id === variableId ? { ...item, name: nextName } : item)),
        calculations: object.calculations.map((item) =>
          item.id === variableId ? { ...item, name: nextName } : item,
        ),
      };
    }),
  });
}

function withIdentityPatch<T extends { id: string; name: string }>(current: T, patch: Partial<T>): T {
  const next = { ...current, ...patch };
  if (patch.id && (!current.name || current.name === current.id) && patch.name === undefined) {
    next.name = patch.id;
  }
  return next;
}

function sourceQuantityFields(
  source: { quantity?: string | null; unit?: string | null },
  catalog: QuantitySpec[],
): { quantity: string | null; unit: string | null } {
  const quantity = source.quantity ?? null;
  return { quantity, unit: source.unit ?? siUnitFor(quantity, catalog) };
}

function inheritMappedQuantity(
  project: ProjectDocument,
  sourceObjectId: string,
  sourceVariableId: string,
  quantity: string | null,
  unit: string | null,
): ProjectDocument {
  const visited = new Set<string>();
  const queue: Array<{ objectId: string; variableId: string }> = [
    { objectId: sourceObjectId, variableId: sourceVariableId },
  ];
  let next = project;
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const key = `${current.objectId}::${current.variableId}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const edge of next.edges) {
      if (edge.enabled === false) continue;
      if (edge.sourceObjectId !== current.objectId || edge.sourceVariableId !== current.variableId) continue;
      next = patchObject(next, edge.targetObjectId, (object) => ({
        ...object,
        inputs: object.inputs.map((item) =>
          item.id === edge.targetVariableId ? { ...item, quantity, unit } : item,
        ),
      }));
      next = syncProjectObject(next, edge.targetObjectId);
      queue.push({ objectId: edge.targetObjectId, variableId: edge.targetVariableId });
    }
  }
  return next;
}

export function detachMappedInput(
  project: ProjectDocument,
  objectId: string,
  inputId: string,
): { project: ProjectDocument; newId: string } {
  const freshId = nextGlobalPrefixedId(project, "IN");
  const next = patchObject(project, objectId, (object) => {
    const rewritten = rewriteFormulas(object, inputId, freshId);
    return {
      ...rewritten,
      inputs: rewritten.inputs.map((item) =>
        item.id === inputId
          ? { ...item, id: freshId, name: freshId, status: item.value == null ? "idle" : "ok", error: null }
          : item,
      ),
    };
  });
  return { project: next, newId: freshId };
}

function sourcePortTaken(
  project: ProjectDocument,
  sourceObjectId: string,
  sourceVariableId: string,
): boolean {
  return project.edges.some(
    (edge) =>
      isValueFlowEdge(edge) &&
      edge.sourceObjectId === sourceObjectId &&
      edge.sourceVariableId === sourceVariableId,
  );
}

function targetPortTaken(
  project: ProjectDocument,
  targetObjectId: string,
  targetVariableId: string,
): boolean {
  return project.edges.some(
    (edge) =>
      isValueFlowEdge(edge) &&
      edge.targetObjectId === targetObjectId &&
      edge.targetVariableId === targetVariableId,
  );
}

function _endpointExists(
  object: ProjectDocument["objects"][number],
  portId: string,
  role: "source" | "target",
): boolean {
  if (isMemoObject(object)) return false;
  if (isLayoutObject(object)) {
    return layoutPortExists(object, portId);
  }
  if (role === "source") {
    return (
      object.outputs.some((item) => item.id === portId) ||
      (object.links ?? []).some((item) => item.id === portId)
    );
  }
  return object.inputs.some((item) => item.id === portId);
}

function addCalculationLink(project: ProjectDocument, objectId: string): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const id = nextGlobalPrefixedId(project, "LINK");
  const link: CalculationLink = { id, name: id, targetObjectId: null, targetPortId: null };
  return {
    project: patchObject(project, objectId, (current) => ({
      ...current,
      links: [...(current.links ?? []), link],
    })),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function removeCalculationLink(project: ProjectDocument, objectId: string, index: number): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const removed = (object.links ?? [])[index];
  const next = patchObject(project, objectId, (current) => ({
    ...current,
    links: (current.links ?? []).filter((_, itemIndex) => itemIndex !== index),
  }));
  return {
    project: {
      ...next,
      edges: next.edges.filter(
        (edge) =>
          !(
            edge.sourceObjectId === objectId &&
            removed &&
            edge.sourceVariableId === removed.id &&
            !isValueFlowEdge(edge)
          ),
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateCalculationLink(
  project: ProjectDocument,
  objectId: string,
  index: number,
  patch: Partial<CalculationLink>,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const current = (object.links ?? [])[index];
  if (!current) return noEval(project);
  const nextId = patch.id ?? current.id;
  const nextName = (patch.name ?? current.name).trim() || nextId;
  if (!VARIABLE_ID_RE.test(nextId)) return noEval(project);
  if (nextId !== current.id && (object.links ?? []).some((item) => item.id === nextId)) return noEval(project);
  const next = patchObject(project, objectId, (item) => ({
    ...item,
    links: (item.links ?? []).map((link, itemIndex) =>
      itemIndex === index ? { ...link, id: nextId, name: nextName } : link,
    ),
  }));
  return {
    project: {
      ...next,
      edges: next.edges.map((edge) =>
        edge.sourceObjectId === objectId && edge.sourceVariableId === current.id
          ? { ...edge, sourceVariableId: nextId }
          : edge,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function connectObjectLink(
  project: ProjectDocument,
  objectId: string,
  linkId: string | undefined,
  targetObjectId: string | null,
  targetPortId: string | null,
): EditResult {
  let next = project;
  let resolvedId = linkId;
  const object = next.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  if (targetObjectId && !canConnectObjectLink(next, objectId, targetObjectId, resolvedId)) {
    return noEval(project);
  }
  if (!resolvedId) {
    const empty = (object.links ?? []).find((item) => !item.targetObjectId);
    if (empty) {
      resolvedId = empty.id;
    } else {
      next = addCalculationLink(next, objectId).project;
      const created = next.objects.find((item) => item.id === objectId);
      resolvedId =
        created && isCalculationObject(created) ? created.links?.at(-1)?.id : undefined;
    }
  }
  if (!resolvedId) return noEval(project);
  return connectCalculationLink(next, objectId, resolvedId, targetObjectId, targetPortId);
}

function connectCalculationLink(
  project: ProjectDocument,
  objectId: string,
  linkId: string,
  targetObjectId: string | null,
  _targetPortId: string | null,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const link = (object.links ?? []).find((item) => item.id === linkId);
  if (!link) return noEval(project);
  if (targetObjectId) {
    const host = project.objects.find((item) => item.id === targetObjectId);
    if (!host || !isLayoutObject(host)) return noEval(project);
    if (!canConnectObjectLink(project, objectId, targetObjectId, linkId)) return noEval(project);
  }
  const nextPort = targetObjectId ? OBJECT_LINK_HANDLE : null;
  const next = patchObject(project, objectId, (item) => ({
    ...item,
    links: (item.links ?? []).map((itemLink) =>
      itemLink.id === linkId ? { ...itemLink, targetObjectId, targetPortId: nextPort } : itemLink,
    ),
  }));
  const without = next.edges.filter(
    (edge) => !(edge.sourceObjectId === objectId && edge.sourceVariableId === linkId && !isValueFlowEdge(edge)),
  );
  if (!targetObjectId) {
    return { project: { ...next, edges: without }, dirtyObjectIds: [], shouldEvaluate: false };
  }
  return {
    project: {
      ...next,
      edges: [
        ...without,
        {
          id: `edge-${objectId}-${linkId}-${targetObjectId}-${nextPort}`,
          sourceObjectId: objectId,
          sourceVariableId: linkId,
          targetObjectId,
          targetVariableId: nextPort ?? targetObjectId,
          enabled: true,
          collapsed: false,
          relationType: "association",
        },
      ],
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function withSiUnit<T extends { quantity?: string | null; unit?: string | null }>(
  patch: T,
  catalog: QuantitySpec[],
): T {
  if (!("quantity" in patch)) return patch;
  return { ...patch, unit: siUnitFor(patch.quantity, catalog) };
}

export type CalculationEdit =
  | { type: "addObject"; position?: { x: number; y: number } }
  | { type: "renameObject"; objectId: string; name: string }
  | { type: "updateObject"; objectId: string; patch: { id?: string; name?: string; width?: number; position?: { x: number; y: number } } }
  | { type: "addInput"; objectId: string }
  | { type: "removeInput"; objectId: string; index: number }
  | { type: "updateInput"; objectId: string; index: number; patch: Partial<InputVariable> }
  | { type: "addCalculation"; objectId: string }
  | { type: "removeCalculation"; objectId: string; index: number }
  | { type: "updateCalculation"; objectId: string; index: number; patch: Partial<FormulaVariable> }
  | { type: "addOutput"; objectId: string }
  | { type: "removeOutput"; objectId: string; index: number }
  | { type: "updateOutput"; objectId: string; index: number; patch: Partial<OutputBinding> }
  | { type: "addLink"; objectId: string }
  | { type: "removeLink"; objectId: string; index: number }
  | { type: "updateLink"; objectId: string; index: number; patch: Partial<CalculationLink> }
  | {
      type: "connectLink";
      objectId: string;
      linkId?: string;
      targetObjectId: string | null;
      targetPortId?: string | null;
    }
  | {
      type: "connectMapping";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId: string;
      relationType?: RelationType;
    }
  | {
      type: "connectBySearch";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId?: string;
      relationType?: RelationType;
    }
  | { type: "toggleEdge"; edgeId: string }
  | { type: "toggleEdgeCollapsed"; edgeId: string };

export function isCalculationEdit(edit: { type: string }): edit is CalculationEdit {
  switch (edit.type) {
    case "addObject":
    case "renameObject":
    case "updateObject":
    case "addInput":
    case "removeInput":
    case "updateInput":
    case "addCalculation":
    case "removeCalculation":
    case "updateCalculation":
    case "addOutput":
    case "removeOutput":
    case "updateOutput":
    case "addLink":
    case "removeLink":
    case "updateLink":
    case "connectLink":
    case "connectMapping":
    case "connectBySearch":
    case "toggleEdge":
    case "toggleEdgeCollapsed":
      return true;
    default:
      return false;
  }
}

export function applyCalculationEdit(
  project: ProjectDocument,
  edit: CalculationEdit,
  catalog: QuantitySpec[],
): EditResult {
  switch (edit.type) {
    case "addObject": {
      const id = nextObjectId(project);
      const index = project.objects.length;
      const object: CalculationObject = {
        kind: "calculation",
        id,
        name: nextObjectName(project),
        position: edit.position ?? { x: 80 + index * 980, y: 88 },
        inputs: [],
        calculations: [],
        outputs: [],
        links: [],
      };
      return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
    }
    case "renameObject":
      return applyCalculationEdit(
        project,
        { type: "updateObject", objectId: edit.objectId, patch: { name: edit.name } },
        catalog,
      );
    case "updateObject": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current || !isCalculationObject(current)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const nextId = edit.patch.id ?? current.id;
      const nextName = (edit.patch.name ?? current.name).trim();
      if (!nextName) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (edit.patch.id && !OBJECT_ID_RE.test(edit.patch.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (objectIdentityTaken(project, { id: edit.patch.id, name: edit.patch.name }, current.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      if (nextId !== current.id) next = rekeyObject(next, current.id, nextId);
      const nextWidth =
        edit.patch.width != null && isCalculationObject(current) ? snapCalcWidth(edit.patch.width) : undefined;
      const nextPosition = edit.patch.position ?? current.position;
      next = {
        ...next,
        objects: next.objects.map((object) =>
          object.id === nextId
            ? {
                ...object,
                name: nextName,
                position: nextPosition,
                ...(nextWidth != null ? { width: nextWidth } : {}),
              }
            : object,
        ),
      };
      const shouldEvaluate = isCalculationObject(current) && nextId !== current.id;
      return {
        project: next,
        dirtyObjectIds: shouldEvaluate ? [nextId] : [],
        shouldEvaluate,
      };
    }
    case "addInput": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current || !isCalculationObject(current)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const id = nextGlobalPrefixedId(project, "IN");
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            inputs: [...object.inputs, { id, name: id, value: null, quantity: null, unit: null }],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "removeInput":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            inputs: object.inputs.filter((_, index) => index !== edit.index),
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "updateInput": {
      const host = project.objects.find((item) => item.id === edit.objectId);
      if (!host || !isCalculationObject(host)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const current = host.inputs[edit.index];
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const enabledMapped = project.edges.some(
        (edge) =>
          edge.enabled !== false &&
          isValueFlowEdge(edge) &&
          edge.targetObjectId === edit.objectId &&
          edge.targetVariableId === current.id,
      );
      if (enabledMapped && (edit.patch.id || edit.patch.name)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const patch = withSiUnit(withIdentityPatch(current, edit.patch as Partial<InputVariable>), catalog);
      if (patch.id !== current.id && identityTaken(project, { id: patch.id }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (patch.name !== current.name && identityTaken(project, { name: patch.name }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = patchObject(project, edit.objectId, (object) => ({
        ...object,
        inputs: object.inputs.map((item, index) => (index === edit.index ? { ...item, ...patch } : item)),
      }));
      if (patch.id !== current.id) {
        next = rekeyGlobalVariable(next, current.id, patch.id, patch.name);
      } else if (patch.name !== current.name) {
        next = applyDisplayName(next, current.id, patch.name);
      }
      if (patch.quantity !== current.quantity || patch.unit !== current.unit) {
        next = inheritMappedQuantity(
          next,
          edit.objectId,
          patch.id,
          patch.quantity ?? null,
          patch.unit ?? null,
        );
      }
      return {
        project: syncProjectObject(next, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "addCalculation": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current || !isCalculationObject(current)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const id = nextGlobalPrefixedId(project, "CALC");
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            calculations: [
              ...object.calculations,
              { id, name: id, formula: "", quantity: null, unit: null },
            ],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "removeCalculation":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            calculations: object.calculations.filter((_, index) => index !== edit.index),
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "updateCalculation": {
      const host = project.objects.find((item) => item.id === edit.objectId);
      if (!host || !isCalculationObject(host)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const current = host.calculations[edit.index];
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const patch = withSiUnit(withIdentityPatch(current, edit.patch as Partial<FormulaVariable>), catalog);
      if (patch.id !== current.id && identityTaken(project, { id: patch.id }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (patch.name !== current.name && identityTaken(project, { name: patch.name }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = patchObject(project, edit.objectId, (object) => ({
        ...object,
        calculations: object.calculations.map((item, index) => (index === edit.index ? { ...item, ...patch } : item)),
      }));
      if (patch.id !== current.id) {
        next = rekeyGlobalVariable(next, current.id, patch.id, patch.name);
      } else if (patch.name !== current.name) {
        next = applyDisplayName(next, current.id, patch.name);
      }
      if (patch.quantity !== current.quantity || patch.unit !== current.unit) {
        next = inheritMappedQuantity(
          next,
          edit.objectId,
          patch.id,
          patch.quantity ?? null,
          patch.unit ?? null,
        );
      }
      return {
        project: syncProjectObject(next, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "addOutput":
    case "removeOutput":
    case "updateOutput":
      return {
        project: syncProjectObject(project, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "addLink":
      return addCalculationLink(project, edit.objectId);
    case "removeLink":
      return removeCalculationLink(project, edit.objectId, edit.index);
    case "updateLink":
      return updateCalculationLink(project, edit.objectId, edit.index, edit.patch);
    case "connectLink":
      return connectObjectLink(project, edit.objectId, edit.linkId, edit.targetObjectId, edit.targetPortId ?? null);
    case "connectMapping": {
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      if (!sourceObject || !targetObject || edit.sourceObjectId === edit.targetObjectId) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const relationType: RelationType =
        edit.relationType ??
        (isLayoutObject(sourceObject) || isLayoutObject(targetObject) ? "association" : "value_flow");
      if (relationType !== "value_flow") {
        if (!_endpointExists(sourceObject, edit.sourceVariableId, "source") || !_endpointExists(targetObject, edit.targetVariableId, "target")) {
          return { project, dirtyObjectIds: [], shouldEvaluate: false };
        }
        const duplicate = project.edges.some(
          (edge) =>
            edge.sourceObjectId === edit.sourceObjectId &&
            edge.sourceVariableId === edit.sourceVariableId &&
            edge.targetObjectId === edit.targetObjectId &&
            edge.targetVariableId === edit.targetVariableId,
        );
        if (duplicate) return { project, dirtyObjectIds: [], shouldEvaluate: false };
        return {
          project: {
            ...project,
            edges: [
              ...project.edges,
              {
                id: `edge-${edit.sourceObjectId}-${edit.sourceVariableId}-${edit.targetObjectId}-${edit.targetVariableId}`,
                sourceObjectId: edit.sourceObjectId,
                sourceVariableId: edit.sourceVariableId,
                targetObjectId: edit.targetObjectId,
                targetVariableId: edit.targetVariableId,
                enabled: true,
                collapsed: false,
                relationType,
              },
            ],
          },
          dirtyObjectIds: [],
          shouldEvaluate: false,
        };
      }
      if (!isCalculationObject(sourceObject) || !isCalculationObject(targetObject)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const source = sourceVariable(sourceObject, edit.sourceVariableId);
      const target = targetObject.inputs.find((item) => item.id === edit.targetVariableId);
      if (!source || !target) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (targetObject.calculations.some((item) => item.id === source.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (targetPortTaken(project, edit.targetObjectId, edit.targetVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const inherited = sourceQuantityFields(source, catalog);
      const oldId = target.id;
      let next = patchObject(project, edit.targetObjectId, (object) => {
        const rewritten = rewriteFormulas(object, oldId, source.id);
        return {
          ...rewritten,
          inputs: rewritten.inputs.map((item) =>
            item.id === oldId
              ? {
                  ...item,
                  id: source.id,
                  name: source.name,
                  quantity: inherited.quantity,
                  unit: inherited.unit,
                }
              : item,
          ),
        };
      });
      next = {
        ...next,
        edges: [
          ...next.edges,
          {
            id: `edge-${edit.sourceObjectId}-${source.id}-${edit.targetObjectId}-${source.id}`,
            sourceObjectId: edit.sourceObjectId,
            sourceVariableId: source.id,
            targetObjectId: edit.targetObjectId,
            targetVariableId: source.id,
            enabled: true,
            collapsed: false,
            relationType: "value_flow",
          },
        ],
      };
      return {
        project: syncProjectObject(next, edit.targetObjectId),
        dirtyObjectIds: [edit.sourceObjectId, edit.targetObjectId],
        shouldEvaluate: true,
      };
    }
    case "connectBySearch": {
      if (edit.sourceObjectId === edit.targetObjectId) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const relationType: RelationType =
        edit.relationType ??
        ((sourceObject && isLayoutObject(sourceObject)) ||
        (targetObject && isLayoutObject(targetObject))
          ? "association"
          : "value_flow");
      if (relationType === "value_flow" && sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      let targetVariableId = edit.targetVariableId;
      if (!targetVariableId) {
        if (!targetObject || isLayoutObject(targetObject)) {
          return { project, dirtyObjectIds: [], shouldEvaluate: false };
        }
        next = applyCalculationEdit(next, { type: "addInput", objectId: edit.targetObjectId }, catalog).project;
        const created = next.objects.find((item) => item.id === edit.targetObjectId);
        targetVariableId = created && isCalculationObject(created) ? created.inputs.at(-1)?.id : undefined;
      }
      if (!targetVariableId) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      return applyCalculationEdit(
        next,
        {
          type: "connectMapping",
          sourceObjectId: edit.sourceObjectId,
          sourceVariableId: edit.sourceVariableId,
          targetObjectId: edit.targetObjectId,
          targetVariableId,
          relationType,
        },
        catalog,
      );
    }
    case "toggleEdge": {
      const edge = project.edges.find((item) => item.id === edit.edgeId);
      if (!edge) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (!isValueFlowEdge(edge)) {
        return {
          project: {
            ...project,
            edges: project.edges.map((item) =>
              item.id === edge.id ? { ...item, enabled: item.enabled === false } : item,
            ),
          },
          dirtyObjectIds: [],
          shouldEvaluate: false,
        };
      }
      if (edge.enabled !== false) {
        const detached = detachMappedInput(project, edge.targetObjectId, edge.targetVariableId);
        const next = {
          ...detached.project,
          edges: detached.project.edges.map((item) =>
            item.id === edge.id ? { ...item, enabled: false, targetVariableId: detached.newId } : item,
          ),
        };
        return {
          project: syncProjectObject(next, edge.targetObjectId),
          dirtyObjectIds: [edge.sourceObjectId, edge.targetObjectId],
          shouldEvaluate: true,
        };
      }
      const sourceObject = project.objects.find((item) => item.id === edge.sourceObjectId);
      const source =
        sourceObject && isCalculationObject(sourceObject)
          ? sourceVariable(sourceObject, edge.sourceVariableId)
          : null;
      if (!source) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const oldId = edge.targetVariableId;
      const inherited = sourceQuantityFields(source, catalog);
      let next = patchObject(project, edge.targetObjectId, (object) => {
        const rewritten = rewriteFormulas(object, oldId, source.id);
        return {
          ...rewritten,
          inputs: rewritten.inputs.map((item) =>
            item.id === oldId
              ? { ...item, id: source.id, name: source.name, quantity: inherited.quantity, unit: inherited.unit }
              : item,
          ),
        };
      });
      next = {
        ...next,
        edges: next.edges.map((item) =>
          item.id === edge.id ? { ...item, enabled: true, targetVariableId: source.id } : item,
        ),
      };
      return {
        project: syncProjectObject(next, edge.targetObjectId),
        dirtyObjectIds: [edge.sourceObjectId, edge.targetObjectId],
        shouldEvaluate: true,
      };
    }
    case "toggleEdgeCollapsed": {
      if (!project.edges.some((item) => item.id === edit.edgeId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      return {
        project: {
          ...project,
          edges: project.edges.map((item) =>
            item.id === edit.edgeId ? { ...item, collapsed: item.collapsed !== true } : item,
          ),
        },
        dirtyObjectIds: [],
        shouldEvaluate: false,
      };
    }
  }
}
