import { describe, expect, it } from "vitest";
import { invalidProjectImportReason } from "./document";

describe("project import validation", () => {
  it("accepts a minimal v0.1 document and JSON without schemaVersion", () => {
    expect(
      invalidProjectImportReason({
        id: "ws",
        name: "ws",
        objects: [],
        edges: [],
      }),
    ).toBeNull();
    expect(
      invalidProjectImportReason({
        id: "ws",
        name: "ws",
        schemaVersion: "0.1",
        objects: [{ id: "obj_1" }],
        edges: [],
      }),
    ).toBeNull();
  });

  it("rejects unknown schema versions and broken objects or edges", () => {
    expect(
      invalidProjectImportReason({
        id: "ws",
        name: "ws",
        schemaVersion: "9.9",
        objects: [],
        edges: [],
      }),
    ).toMatch(/schemaVersion/);
    expect(invalidProjectImportReason({ id: "ws", name: "ws", objects: [{}], edges: [] })).toMatch(/id/);
    expect(
      invalidProjectImportReason({
        id: "ws",
        name: "ws",
        objects: [{ id: "a" }],
        edges: [{ sourceObjectId: "a" }],
      }),
    ).toMatch(/연결/);
  });
});
