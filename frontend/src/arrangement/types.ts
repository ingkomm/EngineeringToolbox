import type { ObjectLinkSide } from "../shared/primitives";

export type ArrangementLinkKind = "pipe" | "signal";
export type EquipmentRotation = 0 | 90 | 180 | 270;

export interface PointEnd {
  objectId: string;
  portId: string;
  reversed?: boolean;
  equipmentId?: string;
  linkKind?: ArrangementLinkKind;
  showArrow?: boolean;
  waypoints?: Array<{ x: number; y: number }>;
}

export interface EquipmentObject {
  kind: "equipment";
  id: string;
  name: string;
  position: { x: number; y: number };
  symbolId: string;
  inCount: number;
  outCount: number;
  objectLinkSide?: ObjectLinkSide;
  memoLinkSide?: ObjectLinkSide;
  tag?: string;
  rotation?: EquipmentRotation;
  width?: number;
  height?: number;
  drawing?: {
    width: number;
    height: number;
    primitives: Array<
      | { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number }
      | { id: string; kind: "circle"; cx: number; cy: number; r: number }
      | { id: string; kind: "polygon"; points: Array<{ x: number; y: number }> }
    >;
    ports?: Array<{
      id: string;
      x?: number;
      y?: number;
      side?: "left" | "right" | "top" | "bottom";
      offset?: number;
    }>;
  } | null;
}

export interface PointObject {
  kind: "point";
  id: string;
  name: string;
  position: { x: number; y: number };
  connectionCount: number;
  connections: Array<PointEnd | null>;
  objectLinkSide?: ObjectLinkSide;
  memoLinkSide?: ObjectLinkSide;
}
