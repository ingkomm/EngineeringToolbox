import { describe, expect, it } from "vitest";
import {
  applyCandidate,
  FORMULA_FUNCTIONS,
  identifierAt,
  matchingCandidates,
  shouldShowCallout,
} from "./formulaComplete";

describe("formula identifier autocomplete", () => {
  it("reads the prefix at the cursor", () => {
    expect(identifierAt("POU", 3)).toEqual({ start: 0, end: 3, prefix: "POU" });
    expect(identifierAt("POUT - P", 8)).toEqual({ start: 7, end: 8, prefix: "P" });
    expect(identifierAt("POUT - 12", 9)).toBeNull();
  });

  it("matches local IDs by prefix and hides the callout for an exact unique id", () => {
    const candidates = [{ id: "PIN" }, { id: "POUT" }, { id: "POWER" }];
    expect(matchingCandidates("P", candidates).map((item) => item.id)).toEqual(["PIN", "POUT", "POWER"]);
    expect(shouldShowCallout("P", matchingCandidates("P", candidates))).toBe(true);
    expect(shouldShowCallout("POUT", matchingCandidates("POUT", candidates))).toBe(false);
  });

  it("replaces the current identifier with the chosen id", () => {
    const token = identifierAt("X - PO", 6);
    expect(token).not.toBeNull();
    expect(applyCandidate("X - PO", token!, "POUT")).toEqual({ text: "X - POUT", cursor: 8 });
  });

  it("inserts Excel function names with an opening parenthesis", () => {
    const token = identifierAt("RO", 2);
    expect(token).not.toBeNull();
    expect(applyCandidate("RO", token!, "ROUND(")).toEqual({ text: "ROUND(", cursor: 6 });
    expect(matchingCandidates("LO", FORMULA_FUNCTIONS).map((item) => item.id)).toEqual(["LOG", "LOG10"]);
  });
});
