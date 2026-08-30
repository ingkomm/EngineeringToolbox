import { Handle, Position, useConnection } from "@xyflow/react";
import { MEMO_ATTACHMENT_HANDLE, MEMO_RECEIVE_HANDLE } from "./memo";
import type { ObjectLinkSide } from "../shared/worksheet";

/** White right-edge memo link. Memo is source-only; Calculation/Arrangement receive-only. */
export function MemoAttachHandle({
  nodeId,
  side,
  role,
  onToggleSide,
}: {
  nodeId: string;
  side: ObjectLinkSide;
  role: "source" | "target";
  onToggleSide: () => void;
}) {
  const connecting = useConnection();
  const fromMemoSource = connecting.fromHandle?.id === MEMO_ATTACHMENT_HANDLE;
  const handleId = role === "source" ? MEMO_ATTACHMENT_HANDLE : MEMO_RECEIVE_HANDLE;
  const isConnectable =
    role === "source"
      ? !connecting.inProgress || connecting.fromHandle?.id === MEMO_ATTACHMENT_HANDLE
      : !connecting.inProgress || fromMemoSource;

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
      <Handle
        type={role}
        position={Position.Right}
        id={handleId}
        className={`memo-attach memo-attach--${role} nodrag nopan`}
        data-port-category="memo-attachment"
        data-testid={`object-${nodeId}-memo`}
        title="Memo"
        isConnectable={isConnectable}
        isConnectableStart={role === "source"}
        isConnectableEnd={role === "target"}
      />
    </div>
  );
}
