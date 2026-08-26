import type { CalculationObject, FormulaVariable, InputVariable, OutputBinding, ProjectDocument } from "../types/contract";
import { blankProject } from "../example/blankProject";
import { prototypeProject } from "../example/prototypeProject";
import { siUnitFor, type QuantitySpec } from "./quantities";
import {
  displayName,
  identityTaken,
  nextGlobalPrefixedId,
  sourceVariable,
} from "./variables";

export const VARIABLE_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const OBJECT_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export type WorkspaceEdit =
  | { type: "addObject" }
  | { type: "deleteObject"; objectId: string }
  | { type: "renameObject"; objectId: string; name: string }
  | { type: "updateObject"; objectId: string; patch: { id?: string; name?: string } }
  | { type: "addInput"; objectId: string }
  | { type: "removeInput"; objectId: string; index: number }
  | { type: "updateInput"; objectId: string; index: number; patch: Partial<InputVariable> }
  | { type: "addCalculation"; objectId: string }
  | { type: "removeCalculation"; objectId: string; index: number }
  | { type: "updateCalculation"; objectId: string; index: number; patch: Partial<FormulaVariable> }
  | { type: "addOutput"; objectId: string }
  | { type: "removeOutput"; objectId: string; index: number }
  | { type: "updateOutput"; objectId: string; index: number; patch: Partial<OutputBinding> }
  | {
      type: "connectMapping";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId: string;
    }
  | {
      type: "connectBySearch";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId?: string;
    }
  | { type: "toggleEdge"; edgeId: string }
  | { type: "toggleEdgeCollapsed"; edgeId: string }
  | { type: "deleteEdges"; edgeIds: string[] }
  | { type: "loadExample" }
  | { type: "newWorkspace" };

export interface EditResult {
  project: ProjectDocument;
  dirtyObjectIds: string[];
  shouldEvaluate: boolean;
}

function nextObjectId(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.id));
  let n = 1;
  while (used.has(`obj_${n}`)) n += 1;
  return `obj_${n}`;
}

function nextObjectName(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.name.trim()));
  let n = 1;
  while (used.has(`Object ${n}`)) n += 1;
  return `Object ${n}`;
}

function objectIdentityTaken(
  project: ProjectDocument,
  candidate: { id?: string; name?: string },
  exceptId: string,
): "id" | "name" | null {
  for (const object of project.objects) {
    if (object.id === exceptId) continue;
    if (candidate.id && object.id === candidate.id) return "id";
    const name = candidate.name?.trim();
    if (name && object.name.trim() === name) return "name";
  }
  return null;
}

function rekeyObject(project: ProjectDocument, fromId: string, toId: string): ProjectDocument {
  if (fromId === toId) return project;
  return {
    ...project,
    objects: project.objects.map((object) => (object.id === fromId ? { ...object, id: toId } : object)),
    edges: project.edges.map((edge) => ({
      ...edge,
      sourceObjectId: edge.sourceObjectId === fromId ? toId : edge.sourceObjectId,
      targetObjectId: edge.targetObjectId === fromId ? toId : edge.targetObjectId,
    })),
  };
}

function patchObject(
  project: ProjectDocument,
  objectId: string,
  mutate: (object: CalculationObject) => CalculationObject,
): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => (object.id === objectId ? mutate(object) : object)),
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
  const next = patchObject(project, objectId, syncObjectOutputs);
  const object = next.objects.find((item) => item.id === objectId);
  if (!object) return next;
  const outputIds = new Set(object.outputs.map((item) => item.id));
  const inputIds = new Set(object.inputs.map((item) => item.id));
  return {
    ...next,
    edges: next.edges.filter((edge) => {
      if (edge.sourceObjectId === objectId && !outputIds.has(edge.sourceVariableId)) return false;
      if (edge.targetObjectId === objectId && !inputIds.has(edge.targetVariableId)) return false;
      return true;
    }),
  };
}

function syncAllObjects(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map(syncObjectOutputs),
  };
}

function rekeyGlobalVariable(project: ProjectDocument, fromId: string, toId: string, nextName: string): ProjectDocument {
  const renamed: ProjectDocument = {
    ...project,
    objects: project.objects.map((object) => ({
      ...object,
      inputs: object.inputs.map((item) => (item.id === fromId ? { ...item, id: toId, name: nextName } : item)),
      calculations: object.calculations.map((item) => ({
        ...item,
        id: item.id === fromId ? toId : item.id,
        name: item.id === fromId ? nextName : item.name,
        formula: rewriteIdentifier(item.formula, fromId, toId),
      })),
    })),
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
    objects: project.objects.map((object) => ({
      ...object,
      inputs: object.inputs.map((item) => (item.id === variableId ? { ...item, name: nextName } : item)),
      calculations: object.calculations.map((item) =>
        item.id === variableId ? { ...item, name: nextName } : item,
      ),
    })),
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

function detachMappedInput(
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
    (edge) => edge.sourceObjectId === sourceObjectId && edge.sourceVariableId === sourceVariableId,
  );
}

function targetPortTaken(
  project: ProjectDocument,
  targetObjectId: string,
  targetVariableId: string,
): boolean {
  return project.edges.some(
    (edge) => edge.targetObjectId === targetObjectId && edge.targetVariableId === targetVariableId,
  );
}

export function applyWorkspaceEdit(
  project: ProjectDocument,
  edit: WorkspaceEdit,
  catalog: QuantitySpec[],
): EditResult {
  switch (edit.type) {
    case "newWorkspace":
      return { project: structuredClone(blankProject), dirtyObjectIds: [], shouldEvaluate: false };
    case "loadExample":
      return { project: syncAllObjects(structuredClone(prototypeProject)), dirtyObjectIds: [], shouldEvaluate: true };
    case "addObject": {
      const id = nextObjectId(project);
      const index = project.objects.length;
      const object: CalculationObject = {
        id,
        name: nextObjectName(project),
        position: { x: 80 + index * 1280, y: 88 },
        inputs: [],
        calculations: [],
        outputs: [],
      };
      return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
    }
    case "deleteObject":
      return {
        project: {
          ...project,
          objects: project.objects.filter((object) => object.id !== edit.objectId),
          edges: project.edges.filter(
            (edge) => edge.sourceObjectId !== edit.objectId && edge.targetObjectId !== edit.objectId,
          ),
        },
        dirtyObjectIds: [],
        shouldEvaluate: true,
      };
    case "renameObject":
      return applyWorkspaceEdit(
        project,
        { type: "updateObject", objectId: edit.objectId, patch: { name: edit.name } },
        catalog,
      );
    case "updateObject": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
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
      next = patchObject(next, nextId, (object) => ({ ...object, name: nextName }));
      return {
        project: next,
        dirtyObjectIds: nextId === current.id ? [] : [nextId],
        shouldEvaluate: nextId !== current.id,
      };
    }
    case "addInput": {
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
      const current = project.objects.find((item) => item.id === edit.objectId)?.inputs[edit.index];
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const enabledMapped = project.edges.some(
        (edge) => edge.enabled !== false && edge.targetObjectId === edit.objectId && edge.targetVariableId === current.id,
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
      const current = project.objects.find((item) => item.id === edit.objectId)?.calculations[edit.index];
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
    case "connectMapping": {
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      if (!sourceObject || !targetObject || edit.sourceObjectId === edit.targetObjectId) {
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
      if (sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      let targetVariableId = edit.targetVariableId;
      if (!targetVariableId) {
        next = applyWorkspaceEdit(next, { type: "addInput", objectId: edit.targetObjectId }, catalog).project;
        targetVariableId = next.objects.find((item) => item.id === edit.targetObjectId)?.inputs.at(-1)?.id;
      }
      if (!targetVariableId) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      return applyWorkspaceEdit(
        next,
        {
          type: "connectMapping",
          sourceObjectId: edit.sourceObjectId,
          sourceVariableId: edit.sourceVariableId,
          targetObjectId: edit.targetObjectId,
          targetVariableId,
        },
        catalog,
      );
    }
    case "toggleEdge": {
      const edge = project.edges.find((item) => item.id === edit.edgeId);
      if (!edge) return { project, dirtyObjectIds: [], shouldEvaluate: false };
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
      const source = sourceObject ? sourceVariable(sourceObject, edge.sourceVariableId) : null;
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
    case "deleteEdges": {
      const removed = new Set(edit.edgeIds);
      const dropping = project.edges.filter((edge) => removed.has(edge.id));
      let next = project;
      for (const edge of dropping) {
        if (edge.enabled !== false) {
          next = detachMappedInput(next, edge.targetObjectId, edge.targetVariableId).project;
        }
      }
      next = { ...next, edges: next.edges.filter((edge) => !removed.has(edge.id)) };
      next = syncAllObjects(next);
      return {
        project: next,
        dirtyObjectIds: dropping.map((edge) => edge.targetObjectId),
        shouldEvaluate: true,
      };
    }
  }
}

function withSiUnit<T extends { quantity?: string | null; unit?: string | null }>(
  patch: T,
  catalog: QuantitySpec[],
): T {
  if (!("quantity" in patch)) return patch;
  return { ...patch, unit: siUnitFor(patch.quantity, catalog) };
}
