/** Prefix keeps IDs valid against OBJECT_ID_RE (must start with a letter). */
export function newStableId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid.replace(/-/g, "")}`;
}
