/**
 * Frontend types mirroring shared/schema/project.schema.json.
 * No engineering calculation logic lives here.
 */

export type VariableStatus = "idle" | "ok" | "mapped" | "error";
export type RelationType = "value_flow" | "reference" | "association" | "pipe" | "signal";
export type PortCategory = "calc-input" | "calc-output" | "arrangement-point";
export type ObjectLinkSide = "top" | "bottom";
export type ArrangementLinkKind = "pipe" | "signal";
export type EquipmentRotation = 0 | 90 | 180 | 270;

export interface InputVariable {
  id: string;
  name: string;
  value: number | null;
  quantity?: string | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface FormulaVariable {
  id: string;
  name: string;
  formula: string;
  value?: number | null;
  quantity?: string | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface OutputBinding {
  id: string;
  name: string;
  sourceVariableId: string;
  value?: number | null;
  quantity?: string | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface CalculationLink {
  id: string;
  name: string;
  targetObjectId?: string | null;
  targetPortId?: string | null;
}

export interface CalculationObject {
  kind?: "calculation";
  id: string;
  name: string;
  position: { x: number; y: number };
  inputs: InputVariable[];
  calculations: FormulaVariable[];
  outputs: OutputBinding[];
  links?: CalculationLink[];
  objectLinkSide?: ObjectLinkSide;
  width?: number;
}

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
}

export type WorksheetObject = CalculationObject | EquipmentObject | PointObject;

export interface MappingEdge {
  id: string;
  sourceObjectId: string;
  sourceVariableId: string;
  targetObjectId: string;
  targetVariableId: string;
  enabled: boolean;
  collapsed?: boolean;
  relationType?: RelationType;
}

export interface ProjectDocument {
  id: string;
  name: string;
  objects: WorksheetObject[];
  edges: MappingEdge[];
  symbolLibrary?: Array<{
    id: string;
    name: string;
    kind: "equipment" | "point";
    inCount?: number;
    outCount?: number;
    drawing?: EquipmentObject["drawing"];
    category?: string;
  }>;
  symbolCategories?: string[];
}

export interface EvalError {
  objectId?: string | null;
  variableId?: string | null;
  code: string;
  message: string;
}

export interface EvaluateRequest {
  project: ProjectDocument;
  dirtyObjectIds?: string[] | null;
}

export interface EvaluateResponse {
  project: ProjectDocument;
  evaluatedObjectIds: string[];
  errors: EvalError[];
}
