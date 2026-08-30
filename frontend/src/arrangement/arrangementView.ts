import { Position } from "@xyflow/react";
import type { ArrangementLinkKind, EquipmentObject, EquipmentRotation, PointEnd } from "../types/contract";
import { equipmentSize, normalizeRotation } from "./symbols/registry";
import { mergePortAnchors, resolveDrawing, type EdgeSide } from "./symbols/drawing";

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
  const drawing = resolveDrawing(object.symbolId, object.drawing);
  return mergePortAnchors(drawing.ports, object.inCount, object.outCount, drawing.width, drawing.height).map((anchor) => {
    const point = rotatePortXY(anchor.x ?? 0, anchor.y ?? 0, drawing.width, drawing.height, bounds.rotation);
    const side = rotateEdge(
      anchor.side ?? nearestSide(anchor.x ?? 0, anchor.y ?? 0, drawing.width, drawing.height),
      bounds.rotation,
    );
    return {
      ...anchor,
      side,
      position: sideToPosition(side),
      style: {
        left: `${(point.x / bounds.width) * 100}%`,
        top: `${(point.y / bounds.height) * 100}%`,
        right: "auto",
        bottom: "auto",
      },
    };
  });
}

function nearestSide(x: number, y: number, width: number, height: number): EdgeSide {
  const candidates: Array<{ side: EdgeSide; dist: number }> = [
    { side: "left", dist: Math.abs(x) },
    { side: "right", dist: Math.abs(width - x) },
    { side: "top", dist: Math.abs(y) },
    { side: "bottom", dist: Math.abs(height - y) },
  ];
  return candidates.reduce((winner, item) => (item.dist < winner.dist ? item : winner)).side;
}

function rotatePortXY(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: EquipmentRotation,
): { x: number; y: number } {
  if (rotation === 90) return { x: height - y, y: x };
  if (rotation === 180) return { x: width - x, y: height - y };
  if (rotation === 270) return { x: y, y: width - x };
  return { x, y };
}
