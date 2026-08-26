export interface FormulaCandidate {
  id: string;
  hint?: string;
}

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
  id: string,
): { text: string; cursor: number } {
  const next = `${text.slice(0, token.start)}${id}${text.slice(token.end)}`;
  return { text: next, cursor: token.start + id.length };
}
