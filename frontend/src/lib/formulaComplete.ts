export interface FormulaCandidate {
  id: string;
  hint?: string;
  insert?: string;
}

export const FORMULA_FUNCTIONS: FormulaCandidate[] = [
  { id: "ABS", hint: "ABS(number)", insert: "ABS(" },
  { id: "EXP", hint: "EXP(number) · e^n", insert: "EXP(" },
  { id: "INT", hint: "INT(number)", insert: "INT(" },
  { id: "LN", hint: "LN(number) · 자연로그", insert: "LN(" },
  { id: "LOG", hint: "LOG(number, [base]) · 기본 밑 10", insert: "LOG(" },
  { id: "LOG10", hint: "LOG10(number)", insert: "LOG10(" },
  { id: "MAX", hint: "MAX(n1, n2, …)", insert: "MAX(" },
  { id: "MIN", hint: "MIN(n1, n2, …)", insert: "MIN(" },
  { id: "MOD", hint: "MOD(number, divisor)", insert: "MOD(" },
  { id: "PI", hint: "PI()", insert: "PI()" },
  { id: "POWER", hint: "POWER(number, power)", insert: "POWER(" },
  { id: "ROUND", hint: "ROUND(number, [digits])", insert: "ROUND(" },
  { id: "ROUNDDOWN", hint: "ROUNDDOWN(number, [digits])", insert: "ROUNDDOWN(" },
  { id: "ROUNDUP", hint: "ROUNDUP(number, [digits])", insert: "ROUNDUP(" },
  { id: "SIGN", hint: "SIGN(number)", insert: "SIGN(" },
  { id: "SQRT", hint: "SQRT(number)", insert: "SQRT(" },
  { id: "TRUNC", hint: "TRUNC(number, [digits])", insert: "TRUNC(" },
];

export function identifierAt(
  text: string,
  cursor: number,
): { start: number; end: number; prefix: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const match = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
  if (!match) return null;
  const start = safeCursor - match[0].length;
  let end = safeCursor;
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end] ?? "")) {
    end += 1;
  }
  return { start, end, prefix: match[0] };
}

export function matchingCandidates(prefix: string, candidates: FormulaCandidate[]): FormulaCandidate[] {
  if (!prefix) return [];
  const needle = prefix.toUpperCase();
  return candidates.filter((item) => item.id.toUpperCase().startsWith(needle));
}

export function shouldShowCallout(prefix: string, matches: FormulaCandidate[]): boolean {
  if (matches.length === 0) return false;
  if (matches.length === 1 && matches[0]?.id.toUpperCase() === prefix.toUpperCase()) return false;
  return true;
}

export function applyCandidate(
  text: string,
  token: { start: number; end: number },
  inserted: string,
): { text: string; cursor: number } {
  const next = `${text.slice(0, token.start)}${inserted}${text.slice(token.end)}`;
  return { text: next, cursor: token.start + inserted.length };
}
