import { describe, expect, it } from "vitest";
import { defaultSymbolLibrary, newBlankEquipmentSymbol } from "./library";

describe("user symbol library", () => {
  it("starts with pump, valve, and point", () => {
    expect(defaultSymbolLibrary().map((item) => [item.id, item.kind])).toEqual([
      ["pump", "equipment"],
      ["valve", "equipment"],
      ["point", "point"],
    ]);
  });

  it("creates a blank equipment symbol with a unique id", () => {
    const created = newBlankEquipmentSymbol(defaultSymbolLibrary());
    expect(created).toMatchObject({ id: "sym_1", kind: "equipment", inCount: 1, outCount: 1 });
    expect(created.drawing?.primitives).toEqual([]);
  });
});
