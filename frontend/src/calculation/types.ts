import type { ObjectLinkSide, VariableStatus } from "../shared/primitives";

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
  memoLinkSide?: ObjectLinkSide;
  width?: number;
}
