import type { CalculationObject } from "../calculation/types";
import type { EquipmentObject, PointObject } from "../arrangement/types";
import type { MemoObject } from "../memo/types";
import type { RelationType } from "./primitives";

export type { RelationType };

export const SCHEMA_VERSION = "0.1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

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
  schemaVersion?: SchemaVersion;
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

export function invalidProjectImportReason(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "가져오기 실패: 프로젝트 JSON이 아닙니다";
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== "string" || !data.id.trim() || typeof data.name !== "string") {
    return "가져오기 실패: 프로젝트 JSON이 아닙니다";
  }
  if (data.schemaVersion != null && data.schemaVersion !== SCHEMA_VERSION) {
    return `가져오기 실패: schemaVersion ${String(data.schemaVersion)} 은 지원하지 않습니다`;
  }
  if (!Array.isArray(data.objects) || !Array.isArray(data.edges)) {
    return "가져오기 실패: 프로젝트 JSON이 아닙니다";
  }
  for (const object of data.objects) {
    if (!object || typeof object !== "object" || typeof (object as { id?: unknown }).id !== "string") {
      return "가져오기 실패: 객체에 id가 없습니다";
    }
  }
  for (const edge of data.edges) {
    if (!edge || typeof edge !== "object") {
      return "가져오기 실패: 연결에 id가 없습니다";
    }
    const item = edge as Record<string, unknown>;
    if (
      typeof item.sourceObjectId !== "string" ||
      typeof item.targetObjectId !== "string" ||
      typeof item.sourceVariableId !== "string" ||
      typeof item.targetVariableId !== "string"
    ) {
      return "가져오기 실패: 연결 필드가 없습니다";
    }
  }
  return null;
}
