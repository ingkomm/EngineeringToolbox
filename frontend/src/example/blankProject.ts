import type { ProjectDocument } from "../types/contract";
import { SCHEMA_VERSION } from "../types/contract";
import { defaultSymbolLibrary } from "../arrangement/symbols/library";

export const blankProject: ProjectDocument = {
  id: "workspace-1",
  name: "Engineering Workspace",
  schemaVersion: SCHEMA_VERSION,
  objects: [],
  edges: [],
  symbolLibrary: defaultSymbolLibrary(),
};
