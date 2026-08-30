/**
 * Frontend types mirroring shared/schema/project.schema.json.
 * No engineering calculation logic lives here.
 */

export type VariableStatus = "idle" | "ok" | "mapped" | "error";
export type RelationType = "value_flow" | "reference" | "association" | "pipe" | "signal";
export type PortCategory = "calc-input" | "calc-output" | "arrangement-point" | "memo-attachment";
export type ObjectKind = "calculation" | "point" | "memo" | "equipment" | "arrangement-symbol";
export type MemoLinkTargetKind =
  | ObjectKind
  | "calc-input"
  | "calc-formula"
  | "calc-output"
  | "arrangement-edge";
export type MemoLinkRelation = "attachment" | "reference" | "association";
export type MemoBlockType = "text" | "status" | "table" | "flow-diagram" | "object-link";
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

export interface TagRef {
  label: string;
  normalizedKey: string;
}

export interface MemoLink {
  id: string;
  sourceMemoId: string;
  targetObjectId: string;
  targetSubId?: string;
  targetKind: MemoLinkTargetKind;
  relation: MemoLinkRelation;
}

export interface MemoBlockBase {
  id: string;
  type: MemoBlockType;
  order: number;
  collapsed?: boolean;
}

export interface TextBlock extends MemoBlockBase {
  type: "text";
  content: string;
  format: "plain" | "markdown";
}

export interface ObjectLinkBlock extends MemoBlockBase {
  type: "object-link";
  linkIds: string[];
}

export interface StatusItem {
  id: string;
  label?: string;
  value: string;
  color?: string;
}

export interface StatusBlock extends MemoBlockBase {
  type: "status";
  items: StatusItem[];
}

export interface TableColumn {
  id: string;
  name: string;
  width?: number;
}

export interface TableRow {
  id: string;
  cells: Record<string, TableCell>;
}

export type TableCell =
  | { type: "text"; value: string }
  | { type: "number"; value: number | null }
  | { type: "boolean"; value: boolean }
  | { type: "object-reference"; reference: ObjectValueReference };

export interface ObjectValueReference {
  objectId: string;
  subId?: string;
  targetKind: "calc-input" | "calc-output" | "object";
  displayMode: "value" | "name" | "name-and-value";
}

export interface TableBlock extends MemoBlockBase {
  type: "table";
  columns: TableColumn[];
  rows: TableRow[];
}

export interface FlowNode {
  id: string;
  shape: "process" | "decision" | "start-end" | "note";
  text: string;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowDiagramBlock extends MemoBlockBase {
  type: "flow-diagram";
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export type MemoBlock = TextBlock | StatusBlock | TableBlock | FlowDiagramBlock | ObjectLinkBlock;

export interface MemoObject {
  kind: "memo";
  id: string;
  title?: string;
  tags: TagRef[];
  parentId?: string;
  blocks: MemoBlock[];
  links: MemoLink[];
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export type WorksheetObject = CalculationObject | EquipmentObject | PointObject | MemoObject;

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
  schemaVersion?: number;
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
