import { describe, expect, it } from "vitest";
import {
  defaultSymbolLibrary,
  deleteLibraryFolder,
  moveLibrarySymbol,
  newBlankEquipmentSymbol,
  uniqueCategory,
} from "./library";

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

  it("reorders siblings inside a category", () => {
    const library = defaultSymbolLibrary();
    expect(moveLibrarySymbol(library, "pump", 1).map((item) => item.id)).toEqual(["valve", "pump", "point"]);
    expect(moveLibrarySymbol(library, "pump", -1).map((item) => item.id)).toEqual(["pump", "valve", "point"]);
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
});
