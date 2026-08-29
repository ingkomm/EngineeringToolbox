import { Handle, Position } from "@xyflow/react";
import { OBJECT_LINK_HANDLE, type ObjectLinkSide } from "../lib/worksheet";

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
  return (
    <div className={`obj-link-cluster obj-link-cluster--${side} ${hidden ? "" : "is-open"}`}>
      <Handle
        type="source"
        position={side === "bottom" ? Position.Bottom : Position.Top}
        id={OBJECT_LINK_HANDLE}
        className={`obj-link-handle obj-link-handle--${side}`}
        data-testid={`object-${nodeId}-obj`}
        title="객체 링크"
        isConnectable
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
