import { describe, expect, it } from "vitest";
import {
  defaultSymbolLibrary,
  deleteLibraryFolder,
  moveLibrarySymbol,
  newBlankEquipmentSymbol,
  symbolsInFolder,
  uniqueCategory,
} from "./library";

describe("user symbol library", () => {
  it("starts with pump, valve, and vessel as arrangement symbols", () => {
    expect(defaultSymbolLibrary().map((item) => [item.id, item.kind])).toEqual([
      ["pump", "equipment"],
      ["valve", "equipment"],
      ["vessel", "equipment"],
    ]);
  });

  it("creates a blank equipment symbol with a unique id", () => {
    const created = newBlankEquipmentSymbol(defaultSymbolLibrary());
    expect(created).toMatchObject({ id: "sym_1", kind: "equipment", inCount: 1, outCount: 1 });
    expect(created.drawing?.primitives).toEqual([]);
  });

  it("reorders siblings inside a category", () => {
    const library = defaultSymbolLibrary();
    expect(moveLibrarySymbol(library, "pump", 1).map((item) => item.id)).toEqual(["valve", "pump", "vessel"]);
    expect(moveLibrarySymbol(library, "pump", -1).map((item) => item.id)).toEqual(["pump", "valve", "vessel"]);
  });

  it("keeps unique folder names", () => {
    expect(uniqueCategory(["Rotating"], "Rotating")).toBe("Rotating 2");
  });

  it("deletes a folder and moves nested symbols to the parent", () => {
    const library = [
      ...defaultSymbolLibrary().map((item) =>
        item.id === "pump" ? { ...item, category: "Rotating/Pumps" } : item,
      ),
    ];
    const result = deleteLibraryFolder(library, ["Rotating", "Rotating/Pumps"], "Rotating/Pumps");
    expect(result.symbolCategories).toEqual(["Rotating"]);
    expect(result.library.find((item) => item.id === "pump")?.category).toBe("Rotating");
  });

  it("hides a legacy point template from arrangement folders", () => {
    const library = [...defaultSymbolLibrary(), { id: "point", name: "Point", kind: "point" as const }];
    expect(symbolsInFolder(library, "").map((item) => item.id)).toEqual(["pump", "valve", "vessel"]);
  });
});
