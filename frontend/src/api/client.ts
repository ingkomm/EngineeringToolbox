import type { EvaluateResponse, ProjectDocument } from "../types/contract";

export async function evaluateProject(
  project: ProjectDocument,
  dirtyObjectIds?: string[],
): Promise<EvaluateResponse> {
  const response = await fetch("/api/v1/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      dirtyObjectIds: dirtyObjectIds ?? null,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evaluate failed (${response.status}): ${text}`);
  }
  return (await response.json()) as EvaluateResponse;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch("/health");
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}
