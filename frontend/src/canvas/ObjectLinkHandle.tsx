import { Handle, Position } from "@xyflow/react";
import { OBJECT_LINK_HANDLE } from "../lib/worksheet";

export function ObjectLinkHandle({ nodeId }: { nodeId: string }) {
  return (
    <Handle
      type="source"
      position={Position.Top}
      id={OBJECT_LINK_HANDLE}
      className="obj-link-handle"
      data-testid={`object-${nodeId}-obj`}
      title="객체 링크"
      isConnectable
    />
  );
}
