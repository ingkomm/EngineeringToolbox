import { Handle, NodeResizer, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import type { MemoObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { backlinksTo, firstMajorBlock, firstTextPreview, MEMO_ATTACHMENT_HANDLE, memoTitleOf } from "../lib/memo";
import { snapGridSize } from "./symbols/grid";
import type { ProjectDocument } from "../types/contract";
import { FlowDiagramPreview } from "./FlowDiagramEditor";

export type MemoObjectNodeType = Node<
  {
    object: MemoObject;
    project: ProjectDocument;
    onEdit: (edit: WorkspaceEdit) => void;
    onOpen: (objectId: string) => void;
  },
  "memoObject"
>;

export function MemoObjectNode({ id, selected, data }: NodeProps<MemoObjectNodeType>) {
  const { object, project, onEdit, onOpen } = data;
  const connecting = Boolean(useConnection().inProgress);
  const hot = Boolean(selected || connecting);
  const backlinks = backlinksTo(project, id).length;
  const preview = firstTextPreview(object);
  const major = firstMajorBlock(object);
  const title = memoTitleOf(object);

  return (
    <article
      className={`memo-node ${selected ? "is-selected" : ""} ${hot ? "is-hot" : ""}`}
      data-testid={`object-${id}`}
      style={{ width: object.size.width, height: object.size.height }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpen(id);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={110}
        onResizeEnd={(_event, params) =>
          onEdit({
            type: "updateMemo",
            objectId: id,
            patch: { size: { width: snapGridSize(params.width), height: snapGridSize(params.height) } },
          })
        }
      />
      <Handle
        type="source"
        position={Position.Top}
        id={MEMO_ATTACHMENT_HANDLE}
        className={`memo-attach ${hot ? "is-visible" : ""}`}
        data-port-category="memo-attachment"
        data-testid={`object-${id}-memo`}
        title="Memo attachment"
        isConnectable
      />
      <p className="memo-node__kicker">MEMO</p>
      <h3 className="memo-node__title">{title || "제목 없음"}</h3>
      {major?.type === "flow-diagram" ? (
        <FlowDiagramPreview block={major} />
      ) : preview ? (
        <p className="memo-node__preview">{preview}</p>
      ) : (
        <p className="memo-node__preview memo-node__preview--empty">빈 기록</p>
      )}
      <div className="memo-node__tags">
        {object.tags.map((tag) => (
          <span key={tag.normalizedKey} className="memo-tag">
            #{tag.label}
          </span>
        ))}
      </div>
      <footer className="memo-node__meta">
        <span data-testid={`object-${id}-id`}>{object.id.slice(0, 10)}</span>
        <span data-testid={`object-${id}-backlinks`}>↩ {backlinks}</span>
      </footer>
    </article>
  );
}
