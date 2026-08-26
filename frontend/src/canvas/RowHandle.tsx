import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect } from "react";

interface RowHandleProps {
  nodeId: string;
  handleId: string;
  type: "source" | "target";
  position: Position;
  className: string;
}

export function RowHandle({ nodeId, handleId, type, position, className }: RowHandleProps) {
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(nodeId);
  }, [handleId, nodeId, updateNodeInternals]);

  return (
    <Handle
      type={type}
      position={position}
      id={handleId}
      data-testid={`handle-${handleId.replace(":", "-")}`}
      className={className}
      isConnectable
    />
  );
}
