import { describe, expect, it } from "vitest";
import { canConnectPortCategories, defaultPortCategory, portCategoryOf } from "./portCategory";
import { isValidCanvasConnection } from "./connectionRules";
import { libraryPlaceEdit } from "./libraryPlace";
import { applyWorkspaceEdit } from "./projectEdits";
import { FALLBACK_QUANTITIES } from "./quantities";
import { blankProject } from "../example/blankProject";
import type { ProjectDocument } from "../types/contract";
import { arrangementSymbols } from "../arrangement/symbols/library";
import { normalizeLoadedProject } from "./worksheet";

function calcProject(): ProjectDocument {
  return {
    id: "ws",
    name: "ws",
    objects: [
      {
        kind: "calculation",
        id: "obj_1",
        name: "Object 1",
        position: { x: 0, y: 0 },
        inputs: [{ id: "A", name: "A", value: 1 }],
        calculations: [],
        outputs: [{ id: "POWER", name: "POWER", sourceVariableId: "A" }],
      },
      {
        kind: "calculation",
        id: "obj_2",
        name: "Object 2",
        position: { x: 1, y: 0 },
        inputs: [{ id: "B", name: "B", value: null }],
        calculations: [],
        outputs: [{ id: "OUT", name: "OUT", sourceVariableId: "B" }],
      },
      {
        kind: "equipment",
        id: "EQ_1",
        name: "P-101",
        position: { x: 0, y: 0 },
        symbolId: "pump",
        inCount: 1,
        outCount: 1,
        rotation: 0,
      },
      {
        kind: "point",
        id: "PT_1",
        name: "PT_1",
        position: { x: 40, y: 0 },
        connectionCount: 4,
        connections: [null, null, null, null],
      },
    ],
    edges: [],
  };
}

describe("port categories", () => {
  it("classifies calc handles and arrangement points separately", () => {
    const project = calcProject();
    const calc = project.objects[0]!;
    const equipment = project.objects[2]!;
    expect(portCategoryOf(calc, "in:A")).toBe("calc-input");
    expect(portCategoryOf(calc, "out:POWER")).toBe("calc-output");
    expect(portCategoryOf(calc, "OBJ")).toBe("arrangement-point");
    expect(portCategoryOf(calc, "MEMO-in")).toBe("memo-attachment");
    expect(portCategoryOf(equipment, "MEMO-in")).toBe("memo-attachment");
    expect(portCategoryOf(equipment, "IN_1")).toBe("arrangement-point");
    expect(defaultPortCategory(calc, undefined)).toBe("arrangement-point");
  });

  it("allows only output→input and arrangement→arrangement", () => {
    expect(canConnectPortCategories("calc-output", "calc-input")).toBe(true);
    expect(canConnectPortCategories("arrangement-point", "arrangement-point")).toBe(true);
    expect(canConnectPortCategories("calc-input", "calc-input")).toBe(false);
    expect(canConnectPortCategories("calc-output", "calc-output")).toBe(false);
    expect(canConnectPortCategories("arrangement-point", "calc-input")).toBe(false);
    expect(canConnectPortCategories("calc-output", "arrangement-point")).toBe(false);
    expect(canConnectPortCategories("memo-attachment", "memo-attachment")).toBe(true);
    expect(canConnectPortCategories("memo-attachment", "calc-input")).toBe(false);
    expect(canConnectPortCategories("memo-attachment", "arrangement-point")).toBe(false);
  });
});

describe("canvas connection rules", () => {
  it("rejects calc-input to calc-input and calc-output to calc-output", () => {
    const project = calcProject();
    expect(
      isValidCanvasConnection(project, {
        source: "obj_1",
        target: "obj_2",
        sourceHandle: "in:A",
        targetHandle: "in:B",
      }),
    ).toBe(false);
    expect(
      isValidCanvasConnection(project, {
        source: "obj_1",
        target: "obj_2",
        sourceHandle: "out:POWER",
        targetHandle: "out:OUT",
      }),
    ).toBe(false);
  });

  it("allows calc-output to calc-input", () => {
    const project = calcProject();
    expect(
      isValidCanvasConnection(project, {
        source: "obj_1",
        target: "obj_2",
        sourceHandle: "out:POWER",
        targetHandle: "in:B",
      }),
    ).toBe(true);
  });

  it("allows arrangement ports visually without treating them as calc value flow", () => {
    const project = calcProject();
    expect(
      isValidCanvasConnection(project, {
        source: "EQ_1",
        target: "PT_1",
        sourceHandle: "OUT_1",
        targetHandle: "C_1",
      }),
    ).toBe(true);
    expect(
      isValidCanvasConnection(project, {
        source: "EQ_1",
        target: "obj_2",
        sourceHandle: "OUT_1",
        targetHandle: "in:B",
      }),
    ).toBe(false);
  });
});

describe("library placement", () => {
  it("creates a calculation with the existing addObject edit", () => {
    expect(libraryPlaceEdit({ place: "calculation" })).toEqual({ type: "addObject" });
    const project = applyWorkspaceEdit(blankProject, libraryPlaceEdit({ place: "calculation" }), FALLBACK_QUANTITIES)
      .project;
    expect(project.objects.filter((item) => item.kind !== "equipment" && item.kind !== "point")).toHaveLength(2);
  });

  it("keeps port categories after JSON load without stored category fields", () => {
    const raw = JSON.parse(JSON.stringify(calcProject())) as ProjectDocument;
    const loaded = normalizeLoadedProject(raw);
    const calc = loaded.objects[0]!;
    expect(portCategoryOf(calc, "in:A")).toBe("calc-input");
    expect(portCategoryOf(calc, "out:POWER")).toBe("calc-output");
    expect(portCategoryOf(loaded.objects[2]!, "OUT_1")).toBe("arrangement-point");
  });

  it("keeps a legacy point template out of arrangement symbols", () => {
    const loaded = normalizeLoadedProject({
      ...blankProject,
      symbolLibrary: [
        { id: "pump", name: "Pump", kind: "equipment" },
        { id: "point", name: "Point", kind: "point" },
      ],
    });
    expect(loaded.symbolLibrary?.some((item) => item.id === "point")).toBe(true);
    expect(arrangementSymbols(loaded.symbolLibrary ?? []).map((item) => item.id)).toEqual(["pump"]);
  });
});
