import { Handle, Position } from "@xyflow/react";
import { MEMO_ATTACHMENT_HANDLE, MEMO_RECEIVE_HANDLE } from "./memo";
import type { ObjectLinkSide } from "../shared/worksheet";

/** White right-edge memo link. Memo is the source; other objects use this as the receive end. */
export function MemoAttachHandle({
  nodeId,
  side,
  onToggleSide,
}: {
  nodeId: string;
  side: ObjectLinkSide;
  onToggleSide: () => void;
}) {
  return (
    <div className={`memo-attach-cluster memo-attach-cluster--${side}`}>
      <button
        type="button"
        className="memo-attach-side nodrag nopan"
        data-testid={`object-${nodeId}-memo-side`}
        title={side === "top" ? "메모 연결점을 하단으로" : "메모 연결점을 상단으로"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSide();
        }}
      >
        {side === "top" ? "↓" : "↑"}
      </button>
      <div className="memo-attach-ports">
        <Handle
          type="source"
          position={Position.Right}
          id={MEMO_ATTACHMENT_HANDLE}
          className="memo-attach"
          data-port-category="memo-attachment"
          data-testid={`object-${nodeId}-memo`}
          title="Memo"
          isConnectable
        />
        <Handle
          type="target"
          position={Position.Right}
          id={MEMO_RECEIVE_HANDLE}
          className="memo-attach memo-attach--target"
          data-port-category="memo-attachment"
          isConnectable
        />
      </div>
    </div>
  );
}
