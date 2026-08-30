import { useEffect, useLayoutEffect, useState } from "react";
import { NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import type { MemoObject, MemoSection } from "../types/contract";
import type { WorkspaceEdit } from "../shared/projectEdits";
import { renderMemoMarkdown } from "./memoMarkdown";
import { objectLinkSideOf } from "../shared/worksheet";
import { snapGridSize } from "../shared/grid";
import { MemoAttachHandle } from "./MemoAttachHandle";

function stopKeys(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export type MemoObjectNodeType = Node<
  {
    object: MemoObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "memoObject"
>;

export function MemoObjectNode({ id, selected, data }: NodeProps<MemoObjectNodeType>) {
  const { object, onEdit } = data;
  const [editing, setEditing] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const side = objectLinkSideOf(object);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (!selected) {
      setEditing(false);
      setSelectedSectionId(null);
    }
  }, [selected]);

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    side,
    editing,
    object.sections,
    object.title,
    object.size.width,
    object.size.height,
    object.position.x,
    object.position.y,
    updateNodeInternals,
  ]);

  return (
    <article
      className={`memo-node ws-node ${selected ? "is-selected" : ""} ${editing ? "is-editing" : "is-view"}`}
      data-testid={`object-${id}`}
      onKeyDownCapture={(event) => {
        if (!editing) return;
        event.stopPropagation();
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          setEditing(false);
        }
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={180}
        onResize={() => updateNodeInternals(id)}
        onResizeEnd={(_event, params) => {
          updateNodeInternals(id);
          onEdit({
            type: "updateMemo",
            objectId: id,
            patch: {
              size: { width: snapGridSize(params.width), height: snapGridSize(params.height) },
              position: { x: params.x, y: params.y },
            },
          });
        }}
      />
      <MemoAttachHandle
        nodeId={id}
        side={side}
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: side === "top" ? "bottom" : "top",
          })
        }
      />
      <header className="memo-node__header">
        <p className="ws-node__kicker">MEMO</p>
        {editing ? (
          <input
            className="memo-node__title-input nodrag nopan nowheel"
            value={object.title}
            placeholder="제목"
            data-testid={`memo-${id}-title`}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={stopKeys}
            onChange={(event) => onEdit({ type: "updateMemo", objectId: id, patch: { title: event.target.value } })}
            onFocus={() => setSelectedSectionId(null)}
          />
        ) : (
          <h3 className="memo-node__title">{object.title.trim() || "제목 없음"}</h3>
        )}
      </header>
      <div className="memo-node__stack">
        {object.sections.length === 0 && !editing ? <p className="memo-node__preview memo-node__preview--empty">빈 기록</p> : null}
        {object.sections.map((section) =>
          section.type === "text" ? (
            <TextSection
              key={section.id}
              memoId={id}
              section={section}
              editing={editing}
              selected={selectedSectionId === section.id}
              onSelect={() => setSelectedSectionId(section.id)}
              onEdit={onEdit}
            />
          ) : (
            <TableSection
              key={section.id}
              memoId={id}
              section={section}
              editing={editing}
              selected={selectedSectionId === section.id}
              onSelect={() => setSelectedSectionId(section.id)}
              onEdit={onEdit}
            />
          ),
        )}
        {editing ? (
          <div className="memo-node__add">
            <button
              type="button"
              className="nodrag"
              data-testid={`memo-${id}-add-text`}
              onClick={() => onEdit({ type: "addMemoSection", objectId: id, sectionType: "text" })}
            >
              + 글상자
            </button>
            <button
              type="button"
              className="nodrag"
              data-testid={`memo-${id}-add-table`}
              onClick={() => onEdit({ type: "addMemoSection", objectId: id, sectionType: "table" })}
            >
              + 표 추가
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TextSection({
  memoId,
  section,
  editing,
  selected,
  onSelect,
  onEdit,
}: {
  memoId: string;
  section: Extract<MemoSection, { type: "text" }>;
  editing: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  if (!editing) {
    return <div className="memo-md">{renderMemoMarkdown(section.content) ?? <p className="memo-node__preview--empty">빈 글상자</p>}</div>;
  }
  return (
    <div className={`memo-node__text-wrap ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <textarea
        className="memo-node__body nodrag nopan nowheel"
        value={section.content}
        placeholder="마크다운 본문"
        data-testid={`memo-${memoId}-text-${section.id}`}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={stopKeys}
        onFocus={onSelect}
        onChange={(event) =>
          onEdit({ type: "updateMemoSection", objectId: memoId, sectionId: section.id, patch: { content: event.target.value } })
        }
      />
      {selected ? (
        <button type="button" className="nodrag memo-node__remove" onClick={() => onEdit({ type: "removeMemoSection", objectId: memoId, sectionId: section.id })}>
          글상자 삭제
        </button>
      ) : null}
    </div>
  );
}

function TableSection({
  memoId,
  section,
  editing,
  selected,
  onSelect,
  onEdit,
}: {
  memoId: string;
  section: Extract<MemoSection, { type: "table" }>;
  editing: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const cells = section.cells;
  const setCells = (next: string[][]) => onEdit({ type: "updateMemoSection", objectId: memoId, sectionId: section.id, patch: { cells: next } });
  return (
    <div
      className={`memo-node__table-wrap ${selected ? "is-selected" : ""}`}
      onClick={(event) => {
        if (!editing) return;
        event.stopPropagation();
        onSelect();
      }}
    >
      <table className="memo-node__table">
        <tbody>
          {cells.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, colIndex) => (
                <td key={colIndex}>
                  {editing ? (
                    <input
                      className="nodrag nopan nowheel"
                      value={cell}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={stopKeys}
                      onFocus={onSelect}
                      onChange={(event) =>
                        setCells(
                          cells.map((current, r) =>
                            current.map((value, c) => (r === rowIndex && c === colIndex ? event.target.value : value)),
                          ),
                        )
                      }
                    />
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {editing && selected ? (
        <div className="memo-table__tools">
          <button type="button" className="nodrag" onClick={() => setCells([...cells, cells[0]?.map(() => "") ?? [""]])}>
            행 추가
          </button>
          <button type="button" className="nodrag" onClick={() => setCells(cells.map((row) => [...row, ""]))}>
            열 추가
          </button>
          <button type="button" className="nodrag" disabled={cells.length <= 1} onClick={() => setCells(cells.slice(0, -1))}>
            행 삭제
          </button>
          <button
            type="button"
            className="nodrag"
            disabled={(cells[0]?.length ?? 0) <= 1}
            onClick={() => setCells(cells.map((row) => row.slice(0, -1)))}
          >
            열 삭제
          </button>
          <button type="button" className="nodrag" onClick={() => onEdit({ type: "removeMemoSection", objectId: memoId, sectionId: section.id })}>
            표 삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}
