import { Position } from "@xyflow/react";
import type { ArrangementLinkKind, EquipmentObject, EquipmentRotation, PointEnd } from "../types/contract";
import { equipmentSize, normalizeRotation } from "../canvas/symbols/registry";
import { defaultPortAnchors, type EdgeSide } from "../canvas/symbols/drawing";

export function equipmentTag(object: Pick<EquipmentObject, "id" | "name" | "tag">): string {
  const tag = (object.tag ?? "").trim();
  return tag || object.name || object.id;
}

export function linkKindOf(end: PointEnd | null | undefined): ArrangementLinkKind {
  return end?.linkKind === "signal" ? "signal" : "pipe";
}

export function showArrowOf(end: PointEnd | null | undefined): boolean {
  return end?.showArrow === true;
}

const EDGES: EdgeSide[] = ["left", "top", "right", "bottom"];

export function rotateEdge(side: EdgeSide, rotation: EquipmentRotation): EdgeSide {
  const turns = rotation / 90;
  return EDGES[(EDGES.indexOf(side) + turns) % 4]!;
}

export function sideToPosition(side: EdgeSide): Position {
  if (side === "left") return Position.Left;
  if (side === "right") return Position.Right;
  if (side === "top") return Position.Top;
  return Position.Bottom;
}

export function portSide(kind: "in" | "out", rotation: EquipmentRotation): Position {
  return sideToPosition(rotateEdge(kind === "in" ? "left" : "right", rotation));
}

export function equipmentBounds(object: EquipmentObject) {
  const size = equipmentSize(object);
  const rotation = normalizeRotation(object.rotation);
  const swapped = rotation === 90 || rotation === 270;
  return {
    width: swapped ? size.height : size.width,
    height: swapped ? size.width : size.height,
    rotation,
    size,
  };
}

export function equipmentPortLayout(object: EquipmentObject) {
  const bounds = equipmentBounds(object);
  const drawingHeight = object.drawing?.height ?? bounds.size.height;
  const drawingWidth = object.drawing?.width ?? bounds.size.width;
  return defaultPortAnchors(object.inCount, object.outCount, drawingHeight).map((anchor) => {
    const side = rotateEdge(anchor.side, bounds.rotation);
    const along = side === "left" || side === "right" ? bounds.height : bounds.width;
    const source = side === "left" || side === "right" ? drawingHeight : drawingWidth;
    const offset = source ? (anchor.offset / source) * along : along / 2;
    return {
      ...anchor,
      side,
      position: sideToPosition(side),
      style:
        side === "left" || side === "right"
          ? { top: `${(offset / bounds.height) * 100}%` }
          : { left: `${(offset / bounds.width) * 100}%` },
    };
  });
}
