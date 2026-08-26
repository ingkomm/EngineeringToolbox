import type { CalculationObject, FormulaVariable, InputVariable, OutputBinding, ProjectDocument } from "../types/contract";
import { blankProject } from "../example/blankProject";
import { prototypeProject } from "../example/prototypeProject";
import { siUnitFor, type QuantitySpec } from "./quantities";

export const VARIABLE_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type WorkspaceEdit =
  | { type: "addObject" }
  | { type: "deleteObject"; objectId: string }
  | { type: "renameObject"; objectId: string; name: string }
  | { type: "addInput"; objectId: string }
  | { type: "removeInput"; objectId: string; index: number }
  | { type: "updateInput"; objectId: string; index: number; patch: Partial<InputVariable> }
  | { type: "addCalculation"; objectId: string }
  | { type: "removeCalculation"; objectId: string; index: number }
  | { type: "updateCalculation"; objectId: string; index: number; patch: Partial<FormulaVariable> }
  | { type: "addOutput"; objectId: string }
  | { type: "removeOutput"; objectId: string; index: number }
  | { type: "updateOutput"; objectId: string; index: number; patch: Partial<OutputBinding> }
  | { type: "loadExample" }
  | { type: "newWorkspace" };

export interface EditResult {
  project: ProjectDocument;
  dirtyObjectIds: string[];
  shouldEvaluate: boolean;
}

function allIds(object: CalculationObject): string[] {
  return [...object.inputs, ...object.calculations, ...object.outputs].map((item) => item.id);
}

function nextPrefixedId(existing: string[], prefix: string): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

function nextObjectId(project: ProjectDocument): string {
  return nextPrefixedId(project.objects.map((item) => item.id), "obj");
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

function retargetEdges(
  project: ProjectDocument,
  objectId: string,
  fromId: string,
  toId: string,
): ProjectDocument {
  if (fromId === toId) return project;
  return {
    ...project,
    objects: project.objects.map((object) => {
      if (object.id !== objectId) return object;
      return {
        ...object,
        outputs: object.outputs.map((item) =>
          item.sourceVariableId === fromId ? { ...item, sourceVariableId: toId, id: item.id === fromId ? toId : item.id } : item,
        ),
      };
    }),
    edges: project.edges.map((edge) => {
      if (edge.sourceObjectId === objectId && edge.sourceVariableId === fromId) {
        return { ...edge, sourceVariableId: toId };
      }
      if (edge.targetObjectId === objectId && edge.targetVariableId === fromId) {
        return { ...edge, targetVariableId: toId };
      }
      return edge;
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
  const sources = [...object.inputs, ...object.calculations].map((item) => item.id);
  const previousBySource = new Map(object.outputs.map((item) => [item.sourceVariableId, item]));
  const previousById = new Map(object.outputs.map((item) => [item.id, item]));
  return {
    ...object,
    outputs: sources.map((id) => {
      const prev = previousBySource.get(id) ?? previousById.get(id);
      return {
        id,
        sourceVariableId: id,
        value: prev?.value ?? null,
        quantity: prev?.quantity ?? null,
        unit: prev?.unit ?? null,
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
        name: `Object ${index + 1}`,
        position: { x: 72 + index * 40, y: 96 + index * 36 },
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
      return {
        project: patchObject(project, edit.objectId, (object) => ({ ...object, name: edit.name })),
        dirtyObjectIds: [],
        shouldEvaluate: false,
      };
    case "addInput":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            inputs: [
              ...object.inputs,
              { id: nextPrefixedId(allIds(object), "IN"), value: null, quantity: null, unit: null },
            ],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
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
      let next = patchObject(project, edit.objectId, (object) => {
        const current = object.inputs[edit.index];
        if (!current) return object;
        const patch = withSiUnit(edit.patch, catalog);
        const inputs = object.inputs.map((item, index) => (index === edit.index ? { ...item, ...patch } : item));
        return { ...object, inputs };
      });
      const previous = project.objects.find((item) => item.id === edit.objectId)?.inputs[edit.index]?.id;
      const updated = next.objects.find((item) => item.id === edit.objectId)?.inputs[edit.index]?.id;
      if (previous && updated && previous !== updated) {
        next = patchObject(next, edit.objectId, (object) => rewriteFormulas(object, previous, updated));
        next = retargetEdges(next, edit.objectId, previous, updated);
      }
      return {
        project: syncProjectObject(next, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "addCalculation":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            calculations: [
              ...object.calculations,
              { id: nextPrefixedId(allIds(object), "CALC"), formula: "", quantity: null, unit: null },
            ],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
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
      let next = patchObject(project, edit.objectId, (object) => {
        const current = object.calculations[edit.index];
        if (!current) return object;
        const patch = withSiUnit(edit.patch, catalog);
        const calculations = object.calculations.map((item, index) =>
          index === edit.index ? { ...item, ...patch } : item,
        );
        return { ...object, calculations };
      });
      const previous = project.objects.find((item) => item.id === edit.objectId)?.calculations[edit.index]?.id;
      const updated = next.objects.find((item) => item.id === edit.objectId)?.calculations[edit.index]?.id;
      if (previous && updated && previous !== updated) {
        next = patchObject(next, edit.objectId, (object) => rewriteFormulas(object, previous, updated));
        next = retargetEdges(next, edit.objectId, previous, updated);
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
  }
}

function withSiUnit<T extends { quantity?: string | null; unit?: string | null }>(
  patch: T,
  catalog: QuantitySpec[],
): T {
  if (!("quantity" in patch)) return patch;
  return { ...patch, unit: siUnitFor(patch.quantity, catalog) };
}
