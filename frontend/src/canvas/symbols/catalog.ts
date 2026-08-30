export type SymbolGroupId =
  | "flow-control"
  | "transport"
  | "energy-transfer"
  | "processing"
  | "storage"
  | "thermal"
  | "machines"
  | "fittings";

export interface SymbolGroup {
  id: SymbolGroupId;
  clause: string;
  label: string;
  labelKo: string;
}

export interface SymbolCatalogEntry {
  id: string;
  label: string;
  group: SymbolGroupId;
  width: number;
  height: number;
  inCount: number;
  outCount: number;
}

/** ISO 14084-2:2015 clause groups used by the palette. */
export const SYMBOL_GROUPS: SymbolGroup[] = [
  { id: "flow-control", clause: "7", label: "Fluid flow control", labelKo: "유량 제어" },
  { id: "transport", clause: "9", label: "Fluid transport", labelKo: "유체 이송" },
  { id: "energy-transfer", clause: "10", label: "Energy transfer", labelKo: "열전달" },
  { id: "processing", clause: "11", label: "Fluid processing", labelKo: "유체 처리" },
  { id: "storage", clause: "12", label: "Storage", labelKo: "저장" },
  { id: "thermal", clause: "15", label: "Thermal generators", labelKo: "열원" },
  { id: "machines", clause: "16", label: "Machines / engines", labelKo: "회전기기" },
  { id: "fittings", clause: "6", label: "Pipe fittings", labelKo: "배관 부속" },
];

export const SYMBOL_CATALOG: SymbolCatalogEntry[] = [
  { id: "valve", label: "On-off valve", group: "flow-control", width: 72, height: 48, inCount: 1, outCount: 1 },
  { id: "check-valve", label: "Check valve", group: "flow-control", width: 72, height: 48, inCount: 1, outCount: 1 },
  { id: "control-valve", label: "Control valve", group: "flow-control", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "safety-valve", label: "Safety / relief valve", group: "flow-control", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "damper", label: "Damper", group: "flow-control", width: 72, height: 48, inCount: 1, outCount: 1 },
  { id: "pump", label: "Pump", group: "transport", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "fan-compressor", label: "Fan / compressor", group: "transport", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "vacuum-pump", label: "Vacuum pump", group: "transport", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "heat-exchanger", label: "Heat exchanger", group: "energy-transfer", width: 104, height: 56, inCount: 2, outCount: 2 },
  { id: "condenser", label: "Condenser", group: "energy-transfer", width: 104, height: 56, inCount: 2, outCount: 2 },
  { id: "cooler", label: "Cooler", group: "energy-transfer", width: 96, height: 56, inCount: 2, outCount: 2 },
  { id: "cooling-tower", label: "Cooling tower", group: "energy-transfer", width: 80, height: 80, inCount: 1, outCount: 1 },
  { id: "filter", label: "Filter", group: "processing", width: 72, height: 64, inCount: 1, outCount: 1 },
  { id: "separator", label: "Separator", group: "processing", width: 64, height: 88, inCount: 1, outCount: 2 },
  { id: "mixer", label: "Mixer", group: "processing", width: 64, height: 80, inCount: 2, outCount: 1 },
  { id: "tank-vessel", label: "Tank / vessel", group: "storage", width: 56, height: 88, inCount: 1, outCount: 1 },
  { id: "drum", label: "Drum", group: "storage", width: 96, height: 56, inCount: 1, outCount: 1 },
  { id: "accumulator", label: "Accumulator", group: "storage", width: 56, height: 80, inCount: 1, outCount: 1 },
  { id: "boiler", label: "Boiler (silhouette)", group: "thermal", width: 96, height: 80, inCount: 1, outCount: 2 },
  { id: "furnace", label: "Furnace", group: "thermal", width: 80, height: 72, inCount: 1, outCount: 1 },
  { id: "turbine", label: "Steam turbine", group: "machines", width: 88, height: 64, inCount: 1, outCount: 1 },
  { id: "gas-turbine", label: "Gas turbine", group: "machines", width: 104, height: 64, inCount: 1, outCount: 1 },
  { id: "motor", label: "Motor", group: "machines", width: 64, height: 64, inCount: 1, outCount: 1 },
  { id: "generator", label: "Generator", group: "machines", width: 64, height: 64, inCount: 1, outCount: 1 },
  { id: "strainer", label: "Strainer", group: "fittings", width: 72, height: 56, inCount: 1, outCount: 1 },
  { id: "orifice", label: "Orifice plate", group: "fittings", width: 56, height: 48, inCount: 1, outCount: 1 },
  { id: "reducer", label: "Reducer", group: "fittings", width: 72, height: 40, inCount: 1, outCount: 1 },
  { id: "generic-equipment", label: "Generic equipment", group: "fittings", width: 96, height: 64, inCount: 1, outCount: 1 },
];

const BY_ID = new Map(SYMBOL_CATALOG.map((item) => [item.id, item]));

export function catalogEntry(symbolId: string | undefined): SymbolCatalogEntry {
  return BY_ID.get(symbolId ?? "") ?? BY_ID.get("generic-equipment")!;
}

export function symbolPortDefaults(symbolId?: string): { inCount: number; outCount: number } {
  const entry = catalogEntry(symbolId);
  return { inCount: entry.inCount, outCount: entry.outCount };
}
