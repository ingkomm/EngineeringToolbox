import { parseHandleId } from "./display";
import { canConnectPortCategories, portCategoryOf } from "./portCategory";
import {
  OBJECT_LINK_HANDLE,
  canConnectObjectLink,
  isCalculationObject,
  isLayoutObject,
  isLayoutPortId,
  isObjectLinkHandle,
  isValueFlowEdge,
} from "./worksheet";
import type { ProjectDocument } from "../types/contract";
import { isMemoAttachmentHandle, isMemoObject } from "../memo/memo";

export interface CanvasConnection {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Canvas wiring rules. Arrangement pipes never become calc value bindings.
 * OBJ stays association (calc ↔ layout), not a calc-input.
 */
export function isValidCanvasConnection(project: ProjectDocument, connection: CanvasConnection): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  const sourceObject = project.objects.find((item) => item.id === connection.source);
  const targetObject = project.objects.find((item) => item.id === connection.target);
  if (!sourceObject || !targetObject) return false;

  if (isMemoAttachmentHandle(connection.sourceHandle) || isMemoAttachmentHandle(connection.targetHandle)) {
    return (
      Boolean(isMemoAttachmentHandle(connection.sourceHandle) && isMemoAttachmentHandle(connection.targetHandle)) &&
      (isMemoObject(sourceObject) || isMemoObject(targetObject))
    );
  }

  const sourceCat = portCategoryOf(sourceObject, connection.sourceHandle);
  const targetCat = portCategoryOf(targetObject, connection.targetHandle);
  if (!sourceCat || !targetCat) return false;

  if (isObjectLinkHandle(connection.sourceHandle) || isObjectLinkHandle(connection.targetHandle)) {
    if (
      !(
        (isCalculationObject(sourceObject) && isLayoutObject(targetObject)) ||
        (isLayoutObject(sourceObject) && isCalculationObject(targetObject))
      )
    ) {
      return false;
    }
    const calc = isCalculationObject(sourceObject) ? sourceObject : targetObject;
    const layout = isLayoutObject(sourceObject) ? sourceObject : targetObject;
    return canConnectObjectLink(project, calc.id, layout.id);
  }

  if (!canConnectPortCategories(sourceCat, targetCat)) return false;

  if (sourceCat === "calc-output" && targetCat === "calc-input") {
    const source = parseHandleId(connection.sourceHandle);
    const target = parseHandleId(connection.targetHandle);
    if (source?.kind !== "out" || target?.kind !== "in") return false;
    if (!isCalculationObject(sourceObject) || !isCalculationObject(targetObject)) return false;
    if (targetObject.calculations.some((item) => item.id === source.variableId)) return false;
    const sourceBusy = project.edges.some(
      (edge) =>
        isValueFlowEdge(edge) &&
        edge.sourceObjectId === connection.source &&
        edge.sourceVariableId === source.variableId,
    );
    const targetBusy = project.edges.some(
      (edge) =>
        isValueFlowEdge(edge) &&
        edge.targetObjectId === connection.target &&
        edge.targetVariableId === target.variableId,
    );
    return !sourceBusy && !targetBusy;
  }

  return (
    isLayoutObject(sourceObject) &&
    isLayoutObject(targetObject) &&
    isLayoutPortId(connection.sourceHandle) &&
    isLayoutPortId(connection.targetHandle)
  );
}

export function associationConnectTargets(
  project: ProjectDocument,
  sourceId: string,
  targetId: string,
): { calcId: string; layoutId: string } | null {
  const sourceObject = project.objects.find((item) => item.id === sourceId);
  const targetObject = project.objects.find((item) => item.id === targetId);
  if (!sourceObject || !targetObject) return null;
  if (
    !(
      (isCalculationObject(sourceObject) && isLayoutObject(targetObject)) ||
      (isLayoutObject(sourceObject) && isCalculationObject(targetObject))
    )
  ) {
    return null;
  }
  const calc = isCalculationObject(sourceObject) ? sourceObject : targetObject;
  const layout = isLayoutObject(sourceObject) ? sourceObject : targetObject;
  if (!canConnectObjectLink(project, calc.id, layout.id)) return null;
  return { calcId: calc.id, layoutId: layout.id };
}

export { OBJECT_LINK_HANDLE };
