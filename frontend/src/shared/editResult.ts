import type { ProjectDocument } from "./document";

export interface EditResult {
  project: ProjectDocument;
  dirtyObjectIds: string[];
  shouldEvaluate: boolean;
}

export function noEval(project: ProjectDocument): EditResult {
  return { project, dirtyObjectIds: [], shouldEvaluate: false };
}
