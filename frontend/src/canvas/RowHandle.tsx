import { Handle, Position } from "@xyflow/react";

interface RowHandleProps {
  nodeId: string;
  handleId: string;
  type: "source" | "target";
  position: Position;
  className: string;
}

export function RowHandle({ handleId, type, position, className }: RowHandleProps) {
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
