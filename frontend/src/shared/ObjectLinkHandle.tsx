import { Handle, Position, useConnection } from "@xyflow/react";
import { OBJECT_LINK_HANDLE, type ObjectLinkSide } from "./worksheet";
import { isMemoAttachmentHandle } from "../memo/memo";

export function ObjectLinkHandle({
  nodeId,
  side,
  onToggleSide,
  hidden,
}: {
  nodeId: string;
  side: ObjectLinkSide;
  onToggleSide: () => void;
  hidden?: boolean;
}) {
  const connecting = useConnection();
  const connectable = !connecting.inProgress || !isMemoAttachmentHandle(connecting.fromHandle?.id);
  return (
    <div className={`obj-link-cluster obj-link-cluster--${side} ${hidden ? "" : "is-open"}`}>
      <Handle
        type="source"
        position={side === "bottom" ? Position.Bottom : Position.Top}
        id={OBJECT_LINK_HANDLE}
        className={`obj-link-handle obj-link-handle--${side}`}
        data-port-category="arrangement-point"
        data-testid={`object-${nodeId}-obj`}
        title="객체 링크"
        isConnectable={connectable}
        isConnectableStart={connectable}
        isConnectableEnd={connectable}
      />
      <button
        type="button"
        className="obj-link-side nodrag nopan"
        data-testid={`object-${nodeId}-obj-side`}
        title={side === "top" ? "노란 링크를 하단으로" : "노란 링크를 상단으로"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSide();
        }}
      >
        {side === "top" ? "↓" : "↑"}
      </button>
    </div>
  );
}
