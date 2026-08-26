import { describe, expect, it } from "vitest";
import { inputHandleId, outputHandleId, parseHandleId } from "./display";

describe("React Flow port ids", () => {
  it("uses variable ids, not cell addresses", () => {
    expect(inputHandleId("INPUT_POWER")).toBe("in:INPUT_POWER");
    expect(outputHandleId("POWER")).toBe("out:POWER");
    expect(parseHandleId("out:POWER")).toEqual({ kind: "out", variableId: "POWER" });
    expect(parseHandleId("in:INPUT_POWER")).toEqual({ kind: "in", variableId: "INPUT_POWER" });
  });
});
