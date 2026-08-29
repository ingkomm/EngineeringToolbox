import { Handle, Position } from "@xyflow/react";
import { useState } from "react";
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
  const [hot, setHot] = useState(false);
  return (
    <div
      className={`obj-link-cluster obj-link-cluster--${side} ${hidden ? "" : "is-visible"}`}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      <Handle
        type="source"
        position={side === "bottom" ? Position.Bottom : Position.Top}
        id={OBJECT_LINK_HANDLE}
        className={`obj-link-handle obj-link-handle--${side} ${hidden ? "" : "is-visible"}`}
        data-testid={`object-${nodeId}-obj`}
        title="객체 링크"
        isConnectable
      />
      {hot && !hidden ? (
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
      ) : null}
    </div>
  );
}
