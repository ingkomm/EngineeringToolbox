import { isMemoAttachmentHandle, isMemoObject } from "./memo";
import type { PortCategory, WorksheetObject } from "../types/contract";
import { parseHandleId } from "./display";
import {
  isCalculationObject,
  isLayoutPortId,
  isObjectLinkHandle,
} from "./worksheet";

export type { PortCategory };

export const PORT_CATEGORY_COLOR: Record<PortCategory, string> = {
  "calc-input": "#38BDF8",
  "calc-output": "#22c55e",
  "arrangement-point": "#f0b429",
  "memo-attachment": "#94a3b8",
};

/** Resolve a handle's category. Missing persisted category uses this default. */
export function portCategoryOf(
  object: WorksheetObject,
  handleId: string | null | undefined,
): PortCategory | null {
  if (!handleId) return null;
  if (isMemoAttachmentHandle(handleId) || isMemoObject(object)) {
    if (isMemoAttachmentHandle(handleId)) return "memo-attachment";
  }
  if (isObjectLinkHandle(handleId)) return "arrangement-point";
  if (isCalculationObject(object)) {
    const parsed = parseHandleId(handleId);
    if (parsed?.kind === "in") return "calc-input";
    if (parsed?.kind === "out") return "calc-output";
    if (parsed?.kind === "link") return "arrangement-point";
    return null;
  }
  if (isLayoutPortId(handleId)) return "arrangement-point";
  return null;
}

export function defaultPortCategory(
  object: WorksheetObject,
  handleId: string | null | undefined,
): PortCategory {
  return portCategoryOf(object, handleId) ?? "arrangement-point";
}

export function canConnectPortCategories(source: PortCategory, target: PortCategory): boolean {
  if (source === "calc-output" && target === "calc-input") return true;
  if (source === "arrangement-point" && target === "arrangement-point") return true;
  if (source === "memo-attachment" || target === "memo-attachment") {
    return source === "memo-attachment" || target === "memo-attachment";
  }
  return false;
}
