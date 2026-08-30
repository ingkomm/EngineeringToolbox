import { Handle, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { PortCategory } from "../lib/portCategory";

interface RowHandleProps {
  nodeId: string;
  handleId: string;
  type: "source" | "target";
  position: Position;
  className: string;
  style?: CSSProperties;
  label?: string;
  portCategory: PortCategory;
}

export function RowHandle({ handleId, type, position, className, style, label, portCategory }: RowHandleProps) {
  return (
    <Handle
      type={type}
      position={position}
      id={handleId}
      data-testid={`handle-${handleId.replace(":", "-")}`}
      data-port-category={portCategory}
      className={className}
      style={style}
      isConnectable
    >
      {label ? <span className="ws-port__label">{label}</span> : null}
    </Handle>
  );
}
