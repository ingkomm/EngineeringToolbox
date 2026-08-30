/**
 * Frontend types mirroring shared/schema/project.schema.json.
 * Definitions live in memo, calculation, arrangement, and shared modules.
 * JSON field names and object IDs are unchanged.
 */

export type {
  VariableStatus,
  RelationType,
  PortCategory,
  ObjectLinkSide,
} from "../shared/primitives";

export type {
  InputVariable,
  FormulaVariable,
  OutputBinding,
  CalculationLink,
  CalculationObject,
} from "../calculation/types";

export type {
  ArrangementLinkKind,
  EquipmentRotation,
  PointEnd,
  EquipmentObject,
  PointObject,
} from "../arrangement/types";

export type { MemoTextSection, MemoTableSection, MemoSection, MemoLink, MemoObject } from "../memo/types";

export type {
  WorksheetObject,
  MappingEdge,
  ProjectDocument,
  EvalError,
  EvaluateRequest,
  EvaluateResponse,
} from "../shared/document";
