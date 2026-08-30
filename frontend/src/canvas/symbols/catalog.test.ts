import { describe, expect, it } from "vitest";
import { SYMBOL_CATALOG, SYMBOL_GROUPS, catalogEntry, symbolPortDefaults } from "./catalog";

describe("ISO 14084-2 symbol catalog", () => {
  it("keeps legacy ids and falls back to generic equipment", () => {
    for (const id of ["generic-equipment", "pump", "fan-compressor", "heat-exchanger", "tank-vessel", "turbine", "valve"]) {
      expect(catalogEntry(id).id).toBe(id);
    }
    expect(catalogEntry("unknown-symbol").id).toBe("generic-equipment");
  });

  it("uses even grid sizes so the flow axis sits on the 11px grid", () => {
    const groupIds = new Set(SYMBOL_GROUPS.map((group) => group.id));
    expect(SYMBOL_CATALOG.length).toBeGreaterThan(20);
    for (const item of SYMBOL_CATALOG) {
      expect(groupIds.has(item.group)).toBe(true);
      expect(item.width % 22).toBe(0);
      expect(item.height % 22).toBe(0);
    }
  });

  it("gives multi-stream exchangers two in and two out ports", () => {
    expect(symbolPortDefaults("heat-exchanger")).toEqual({ inCount: 2, outCount: 2 });
    expect(symbolPortDefaults("pump")).toEqual({ inCount: 1, outCount: 1 });
  });
});
