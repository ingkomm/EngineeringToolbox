import type { ProjectDocument } from "../types/contract";
import { defaultSymbolLibrary } from "../canvas/symbols/library";

export const blankProject: ProjectDocument = {
  id: "workspace-1",
  name: "Engineering Workspace",
  objects: [
    {
      id: "obj_1",
      name: "Object 1",
      position: { x: 80, y: 88 },
      inputs: [],
      calculations: [],
      outputs: [],
    },
  ],
  edges: [],
  symbolLibrary: defaultSymbolLibrary(),
};
