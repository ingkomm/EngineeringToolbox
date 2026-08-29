/** Display-only number formatting. Not a calculation. */
export function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Number.isInteger(value)) return String(value);
  const text = value.toFixed(6).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

export function inputHandleId(variableId: string): string {
  return `in:${variableId}`;
}

export function outputHandleId(variableId: string): string {
  return `out:${variableId}`;
}

export function linkHandleId(variableId: string): string {
  return `link:${variableId}`;
}

export function parseHandleId(handleId: string | null | undefined): {
  kind: "in" | "out" | "link";
  variableId: string;
} | null {
  if (!handleId) return null;
  const [kind, ...rest] = handleId.split(":");
  const variableId = rest.join(":");
  if ((kind !== "in" && kind !== "out" && kind !== "link") || !variableId) return null;
  return { kind, variableId };
}
