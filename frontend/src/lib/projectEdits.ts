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

export function applyWorkspaceEdit(
  project: ProjectDocument,
  edit: WorkspaceEdit,
  catalog: QuantitySpec[],
): EditResult {
  switch (edit.type) {
    case "newWorkspace":
      return { project: structuredClone(blankProject), dirtyObjectIds: [], shouldEvaluate: false };
    case "loadExample":
      return { project: structuredClone(prototypeProject), dirtyObjectIds: [], shouldEvaluate: true };
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
        project: patchObject(project, edit.objectId, (object) => ({
          ...object,
          inputs: [
            ...object.inputs,
            { id: nextPrefixedId(allIds(object), "IN"), value: null, quantity: null, unit: null },
          ],
        })),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: false,
      };
    case "removeInput":
      return {
        project: patchObject(project, edit.objectId, (object) => ({
          ...object,
          inputs: object.inputs.filter((_, index) => index !== edit.index),
        })),
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
        next = retargetEdges(next, edit.objectId, previous, updated);
      }
      return { project: next, dirtyObjectIds: [edit.objectId], shouldEvaluate: true };
    }
    case "addCalculation":
      return {
        project: patchObject(project, edit.objectId, (object) => ({
          ...object,
          calculations: [
            ...object.calculations,
            { id: nextPrefixedId(allIds(object), "CALC"), formula: "", quantity: null, unit: null },
          ],
        })),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: false,
      };
    case "removeCalculation":
      return {
        project: patchObject(project, edit.objectId, (object) => ({
          ...object,
          calculations: object.calculations.filter((_, index) => index !== edit.index),
        })),
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
        next = retargetEdges(next, edit.objectId, previous, updated);
      }
      return { project: next, dirtyObjectIds: [edit.objectId], shouldEvaluate: true };
    }
    case "addOutput":
      return {
        project: patchObject(project, edit.objectId, (object) => {
          const source =
            object.calculations.at(-1)?.id ?? object.inputs.at(-1)?.id ?? nextPrefixedId(allIds(object), "OUT");
          const outputId = object.outputs.some((item) => item.id === source)
            ? nextPrefixedId(allIds(object), "OUT")
            : source;
          return {
            ...object,
            outputs: [...object.outputs, { id: outputId, sourceVariableId: source }],
          };
        }),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "removeOutput":
      return {
        project: {
          ...patchObject(project, edit.objectId, (object) => ({
            ...object,
            outputs: object.outputs.filter((_, index) => index !== edit.index),
          })),
          edges: project.edges.filter((edge) => {
            const output = project.objects.find((item) => item.id === edit.objectId)?.outputs[edit.index];
            if (!output) return true;
            return !(edge.sourceObjectId === edit.objectId && edge.sourceVariableId === output.id);
          }),
        },
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "updateOutput": {
      const previous = project.objects.find((item) => item.id === edit.objectId)?.outputs[edit.index];
      let next = patchObject(project, edit.objectId, (object) => ({
        ...object,
        outputs: object.outputs.map((item, index) => (index === edit.index ? { ...item, ...edit.patch } : item)),
      }));
      const updatedId = edit.patch.id;
      if (previous && updatedId && updatedId !== previous.id) {
        next = {
          ...next,
          edges: next.edges.map((edge) =>
            edge.sourceObjectId === edit.objectId && edge.sourceVariableId === previous.id
              ? { ...edge, sourceVariableId: updatedId }
              : edge,
          ),
        };
      }
      return { project: next, dirtyObjectIds: [edit.objectId], shouldEvaluate: true };
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
