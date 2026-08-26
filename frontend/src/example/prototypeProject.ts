import type { ProjectDocument } from "../types/contract";

/** Optional reference worksheet. Not loaded as the default workspace. */
export const prototypeProject: ProjectDocument = {
  id: "prototype-1",
  name: "FLOW-POWER Prototype",
  objects: [
    {
      id: "obj-a",
      name: "Object A",
      position: { x: 72, y: 96 },
      inputs: [
        { id: "FLOW", value: 120, quantity: "mass_flow" },
        { id: "PIN", value: 12, quantity: "pressure" },
        { id: "POUT", value: 15, quantity: "pressure" },
      ],
      calculations: [
        { id: "DP", formula: "POUT - PIN", quantity: "pressure" },
        { id: "POWER", formula: "FLOW * DP", quantity: "power" },
      ],
      outputs: [{ id: "POWER", sourceVariableId: "POWER" }],
    },
    {
      id: "obj-b",
      name: "Object B",
      position: { x: 560, y: 96 },
      inputs: [{ id: "INPUT_POWER", value: null, quantity: "power" }],
      calculations: [{ id: "RESULT", formula: "INPUT_POWER * 2", quantity: "power" }],
      outputs: [{ id: "RESULT", sourceVariableId: "RESULT" }],
    },
  ],
  edges: [
    {
      id: "edge-a-power-b-input",
      sourceObjectId: "obj-a",
      sourceVariableId: "POWER",
      targetObjectId: "obj-b",
      targetVariableId: "INPUT_POWER",
    },
  ],
};
