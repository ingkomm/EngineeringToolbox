import { Handle, Position, useConnection } from "@xyflow/react";
import type { CSSProperties } from "react";
import { isMemoAttachmentHandle } from "../memo/memo";
import type { PortCategory } from "../shared/portCategory";
import { isObjectLinkHandle } from "../shared/worksheet";

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
  const connecting = useConnection();
  const fromId = connecting.fromHandle?.id;
  const isConnectable =
    !connecting.inProgress || (!isMemoAttachmentHandle(fromId) && !isObjectLinkHandle(fromId));
  return (
    <Handle
      type={type}
      position={position}
      id={handleId}
      data-testid={`handle-${handleId.replace(":", "-")}`}
      data-port-category={portCategory}
      className={className}
      style={style}
      isConnectable={isConnectable}
    >
      {label ? <span className="ws-port__label">{label}</span> : null}
    </Handle>
  );
}
