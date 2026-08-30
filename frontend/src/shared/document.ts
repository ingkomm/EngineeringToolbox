import type { CalculationObject } from "../calculation/types";
import type { EquipmentObject, PointObject } from "../arrangement/types";
import type { MemoObject } from "../memo/types";
import type { RelationType } from "./primitives";

export type { RelationType };

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
