import type { CalculationObject, ProjectDocument } from "../types/contract";
import { isCalculationObject } from "../shared/worksheet";

type ResultFields = {
  id: string;
  value?: number | null;
  status?: string | null;
  error?: string | null;
  unit?: string | null;
  quantity?: string | null;
};

function overlayResults<T extends ResultFields>(current: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((item) => [item.id, item]));
  return current.map((item) => {
    const result = byId.get(item.id);
    if (!result) return item;
    return {
      ...item,
      value: result.value,
      status: result.status,
      error: result.error,
      unit: result.unit,
      quantity: result.quantity,
    };
  });
}

function overlayCalculation(current: CalculationObject, incoming: CalculationObject): CalculationObject {
  return {
    ...current,
    inputs: overlayResults(current.inputs, incoming.inputs),
    calculations: overlayResults(current.calculations, incoming.calculations),
    outputs: overlayResults(current.outputs, incoming.outputs),
  };
}

/** Keep the latest worksheet; copy calculation values/status from an evaluate response by object ID. */
export function mergeCalculationResults(current: ProjectDocument, evaluated: ProjectDocument): ProjectDocument {
  const incoming = new Map(
    evaluated.objects.filter(isCalculationObject).map((item) => [item.id, item] as const),
  );
  return {
    ...current,
    objects: current.objects.map((object) => {
      if (!isCalculationObject(object)) return object;
      const result = incoming.get(object.id);
      return result ? overlayCalculation(object, result) : object;
    }),
  };
}
