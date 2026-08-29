import { Handle, Position } from "@xyflow/react";
import type { CSSProperties } from "react";

interface RowHandleProps {
  nodeId: string;
  handleId: string;
  type: "source" | "target";
  position: Position;
  className: string;
  style?: CSSProperties;
  label?: string;
}

export function RowHandle({ handleId, type, position, className, style, label }: RowHandleProps) {
  return (
    <Handle
      type={type}
      position={position}
      id={handleId}
      data-testid={`handle-${handleId.replace(":", "-")}`}
      className={className}
      style={style}
      isConnectable
    >
      {label ? <span className="ws-port__label">{label}</span> : null}
    </Handle>
  );
}
