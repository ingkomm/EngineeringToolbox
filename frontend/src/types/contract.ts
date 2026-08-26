/**
 * Frontend types mirroring shared/schema/project.schema.json.
 * No engineering calculation logic lives here.
 */

export type VariableStatus = "idle" | "ok" | "mapped" | "error";

export interface InputVariable {
  id: string;
  value: number | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface FormulaVariable {
  id: string;
  formula: string;
  value?: number | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface OutputBinding {
  id: string;
  sourceVariableId: string;
  value?: number | null;
  unit?: string | null;
  status?: VariableStatus;
  error?: string | null;
}

export interface CalculationObject {
  id: string;
  name: string;
  position: { x: number; y: number };
  inputs: InputVariable[];
  calculations: FormulaVariable[];
  outputs: OutputBinding[];
}

export interface MappingEdge {
  id: string;
  sourceObjectId: string;
  sourceVariableId: string;
  targetObjectId: string;
  targetVariableId: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  objects: CalculationObject[];
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
