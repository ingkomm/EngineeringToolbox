import type { ReactElement } from "react";
import type { EquipmentRotation } from "../../types/contract";
import { SYMBOL_CATALOG, type SymbolCatalogEntry } from "./catalog";
import { resolveDrawing } from "./drawing";
import { DrawingSvg } from "./DrawingSvg";
import { evenGridSize } from "./grid";

export interface SymbolDef extends SymbolCatalogEntry {
  render: (title: string) => ReactElement;
}

export const SYMBOL_REGISTRY: SymbolDef[] = SYMBOL_CATALOG.map((entry) => ({
  ...entry,
  render: (title) => <DrawingSvg drawing={resolveDrawing(entry.id)} title={title} />,
}));

const BY_ID = new Map(SYMBOL_REGISTRY.map((item) => [item.id, item]));

export function resolveSymbol(symbolId: string | undefined): SymbolDef {
  return BY_ID.get(symbolId ?? "") ?? BY_ID.get("generic-equipment")!;
}

export function normalizeRotation(value: number | undefined): EquipmentRotation {
  const snapped = ((Math.round((value ?? 0) / 90) * 90) % 360 + 360) % 360;
  return snapped as EquipmentRotation;
}

export function equipmentSize(object: { symbolId: string; width?: number; height?: number; drawing?: { width: number; height: number } | null }) {
  const symbol = resolveSymbol(object.symbolId);
  const fromDrawing = object.drawing;
  return {
    width: evenGridSize(object.width ?? fromDrawing?.width ?? symbol.width),
    height: evenGridSize(object.height ?? fromDrawing?.height ?? symbol.height),
  };
}

export { SYMBOL_GROUPS, symbolPortDefaults, catalogEntry } from "./catalog";
