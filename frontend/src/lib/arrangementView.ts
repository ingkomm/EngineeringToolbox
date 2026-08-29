import { Position } from "@xyflow/react";
import type { ArrangementLinkKind, EquipmentObject, EquipmentRotation, PointEnd } from "../types/contract";
import { equipmentSize, normalizeRotation } from "../canvas/symbols/registry";

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

export function portSide(kind: "in" | "out", rotation: EquipmentRotation): Position {
  const order = [Position.Left, Position.Top, Position.Right, Position.Bottom];
  const base = kind === "in" ? 0 : 2;
  const turns = rotation / 90;
  return order[(base + turns) % 4];
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
