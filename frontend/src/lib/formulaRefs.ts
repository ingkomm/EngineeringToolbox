import { FORMULA_FUNCTIONS } from "./formulaComplete";

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const FUNCTION_IDS = new Set(FORMULA_FUNCTIONS.map((item) => item.id.toUpperCase()));

/** Display-only identifier scan. Does not evaluate the formula. */
export function referencedIdentifiers(formula: string): string[] {
  const text = formula.replace(/^\s*=/, "");
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of text.matchAll(IDENTIFIER_RE)) {
    const id = match[0];
    if (FUNCTION_IDS.has(id.toUpperCase()) || seen.has(id.toUpperCase())) continue;
    seen.add(id.toUpperCase());
    names.push(id);
  }
  return names;
}

export function inputIdsReferenced(formula: string, inputIds: string[]): string[] {
  const byUpper = new Map(inputIds.map((id) => [id.toUpperCase(), id]));
  const used: string[] = [];
  const seen = new Set<string>();
  for (const name of referencedIdentifiers(formula)) {
    const id = byUpper.get(name.toUpperCase());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    used.push(id);
  }
  return used;
}

export function formulaLinksForObject(
  calculations: Array<{ id: string; formula: string }>,
  inputIds: string[],
  draftByCalc?: Record<string, string>,
): Array<{ inputId: string; calcId: string }> {
  const links: Array<{ inputId: string; calcId: string }> = [];
  for (const item of calculations) {
    const formula = draftByCalc?.[item.id] ?? item.formula;
    for (const inputId of inputIdsReferenced(formula, inputIds)) {
      links.push({ inputId, calcId: item.id });
    }
  }
  return links;
}
