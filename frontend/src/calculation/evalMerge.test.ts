import { describe, expect, it } from "vitest";
import { mergeCalculationResults } from "./evalMerge";
import type { CalculationObject, ProjectDocument } from "../types/contract";

const calc = (
  id: string,
  extras: Partial<CalculationObject> & { value?: number } = {},
): CalculationObject => ({
  kind: "calculation",
  id,
  name: extras.name ?? id,
  position: extras.position ?? { x: 0, y: 0 },
  width: extras.width,
  inputs: extras.inputs ?? [{ id: "FLOW", name: "FLOW", value: extras.value ?? 1 }],
  calculations: extras.calculations ?? [],
  outputs: extras.outputs ?? [],
});

describe("mergeCalculationResults", () => {
  it("copies calculation values onto the latest project by object id", () => {
    const current: ProjectDocument = {
      id: "ws",
      name: "ws",
      objects: [
        calc("obj_1", { position: { x: 40, y: 80 }, width: 400, name: "Live" }),
        {
          kind: "memo",
          id: "m_1",
          title: "edited",
          sections: [],
          links: [],
          position: { x: 8, y: 8 },
          size: { width: 200, height: 140 },
        },
        {
          kind: "point",
          id: "PT_1",
          name: "P1",
          position: { x: 200, y: 40 },
          connectionCount: 4,
          connections: [null, null, null, null],
        },
      ],
      edges: [],
    };
    const evaluated: ProjectDocument = {
      id: "ws",
      name: "stale",
      objects: [
        calc("obj_1", {
          name: "Stale",
          position: { x: 0, y: 0 },
          inputs: [{ id: "FLOW", name: "FLOW", value: 120, status: "ok" }],
        }),
        {
          kind: "memo",
          id: "m_1",
          title: "stale memo",
          sections: [],
          links: [],
          position: { x: 0, y: 0 },
          size: { width: 200, height: 140 },
        },
        {
          kind: "point",
          id: "PT_1",
          name: "P1",
          position: { x: 0, y: 0 },
          connectionCount: 4,
          connections: [null, null, null, null],
        },
      ],
      edges: [],
    };
    const merged = mergeCalculationResults(current, evaluated);
    const object = merged.objects[0] as CalculationObject;
    expect(object.name).toBe("Live");
    expect(object.position).toEqual({ x: 40, y: 80 });
    expect(object.width).toBe(400);
    expect(object.inputs[0]?.value).toBe(120);
    expect(object.inputs[0]?.status).toBe("ok");
    expect(merged.objects.find((item) => item.id === "m_1")).toMatchObject({ title: "edited", position: { x: 8, y: 8 } });
    expect(merged.objects.find((item) => item.id === "PT_1")).toMatchObject({ position: { x: 200, y: 40 } });
  });
});
