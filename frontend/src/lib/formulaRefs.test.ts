import { describe, expect, it } from "vitest";
import { formulaLinksForObject, inputIdsReferenced, referencedIdentifiers } from "./formulaRefs";

describe("formula identifier scan for internal links", () => {
  it("collects variable ids and skips Excel function names", () => {
    expect(referencedIdentifiers("POUT - PIN")).toEqual(["POUT", "PIN"]);
    expect(referencedIdentifiers("=FLOW * DP")).toEqual(["FLOW", "DP"]);
    expect(referencedIdentifiers("ROUND(PIN, 0) + LOG(POUT)")).toEqual(["PIN", "POUT"]);
  });

  it("keeps only ids that exist as inputs", () => {
    expect(inputIdsReferenced("FLOW * DP", ["FLOW", "PIN"])).toEqual(["FLOW"]);
    expect(inputIdsReferenced("pin + POUT", ["PIN", "POUT"])).toEqual(["PIN", "POUT"]);
  });

  it("builds input-to-calc links from formulas", () => {
    expect(
      formulaLinksForObject(
        [
          { id: "DP", formula: "POUT - PIN" },
          { id: "POWER", formula: "FLOW * DP" },
        ],
        ["FLOW", "PIN", "POUT"],
      ),
    ).toEqual([
      { inputId: "POUT", calcId: "DP" },
      { inputId: "PIN", calcId: "DP" },
      { inputId: "FLOW", calcId: "POWER" },
    ]);
  });

  it("uses an in-progress draft formula while editing", () => {
    expect(
      formulaLinksForObject([{ id: "DP", formula: "POUT - PIN" }], ["FLOW", "PIN", "POUT"], {
        DP: "FLOW",
      }),
    ).toEqual([{ inputId: "FLOW", calcId: "DP" }]);
  });
});
