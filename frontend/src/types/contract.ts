/**
 * Frontend types mirroring shared/schema/project.schema.json.
 * No engineering calculation logic lives here.
 */

export type VariableStatus = "idle" | "ok" | "mapped" | "error";
export type RelationType = "value_flow" | "reference" | "association";

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

export interface CalculationObject {
  kind?: "calculation";
  id: string;
  name: string;
  position: { x: number; y: number };
  inputs: InputVariable[];
  calculations: FormulaVariable[];
  outputs: OutputBinding[];
}

export interface ArrangementEquipment {
  id: string;
  name: string;
  symbolId: string;
  inCount: number;
  outCount: number;
}

export interface PointEnd {
  equipmentId: string;
  portId: string;
}

export interface ArrangementPoint {
  id: string;
  name: string;
  connectionCount: number;
  connections: Array<PointEnd | null>;
}

export interface ArrangementDomain {
  equipment: ArrangementEquipment[];
  points: ArrangementPoint[];
}

export interface ElementView {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
}

export interface ArrangementView {
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  elements: Record<string, ElementView>;
}

export interface ArrangementObject {
  kind: "arrangement";
  id: string;
  name: string;
  position: { x: number; y: number };
  domain: ArrangementDomain;
  view: ArrangementView;
}

export type WorksheetObject = CalculationObject | ArrangementObject;

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
