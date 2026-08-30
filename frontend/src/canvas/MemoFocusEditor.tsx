import { sortedBlocks, childrenOf, memosOf, memoTitleOf } from "../lib/memo";
import type { MemoObject, ProjectDocument, WorksheetObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { objectKindOf } from "../lib/memo";

export function MemoFocusEditor({
  memo,
  project,
  onEdit,
  onClose,
  onFocusObject,
}: {
  memo: MemoObject;
  project: ProjectDocument;
  onEdit: (edit: WorkspaceEdit) => void;
  onClose: () => void;
  onFocusObject: (objectId: string) => void;
}) {
  const blocks = sortedBlocks(memo);
  const parents = memosOf(project).filter((item) => item.id !== memo.id);
  const children = childrenOf(project, memo.id);

  return (
    <div className="memo-focus" data-testid="memo-focus-editor">
      <button type="button" className="memo-focus__scrim" onClick={onClose} aria-label="닫기" />
      <div className="memo-focus__panel">
        <header className="memo-focus__head">
          <div>
            <p className="memo-focus__kicker">MEMO</p>
            <input
              className="memo-focus__title"
              value={memo.title ?? ""}
              placeholder="제목 (선택)"
              data-testid={`memo-${memo.id}-title`}
              onChange={(event) => onEdit({ type: "updateMemo", objectId: memo.id, patch: { title: event.target.value } })}
            />
            <p className="memo-focus__id" data-testid={`memo-${memo.id}-id`}>
              {memo.id}
            </p>
          </div>
          <button type="button" className="ghost-btn" data-testid="btn-close-memo-editor" onClick={onClose}>
            닫기
          </button>
        </header>
        <div className="memo-focus__tags">
          {memo.tags.map((tag) => (
            <button
              key={tag.normalizedKey}
              type="button"
              className="memo-tag"
              onClick={() => onEdit({ type: "removeMemoTag", objectId: memo.id, key: tag.normalizedKey })}
            >
              #{tag.label} ×
            </button>
          ))}
          <input
            className="memo-focus__tag-input"
            placeholder="#tag"
            data-testid={`memo-${memo.id}-tag-input`}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onEdit({ type: "addMemoTag", objectId: memo.id, label: event.currentTarget.value });
              event.currentTarget.value = "";
            }}
          />
        </div>
        <label className="memo-focus__parent">
          Parent
          <select
            value={memo.parentId ?? ""}
            data-testid={`memo-${memo.id}-parent`}
            onChange={(event) =>
              onEdit({
                type: "updateMemo",
                objectId: memo.id,
                patch: { parentId: event.target.value ? event.target.value : null },
              })
            }
          >
            <option value="">없음</option>
            {parents.map((item) => (
              <option key={item.id} value={item.id}>
                {memoTitleOf(item) || item.id}
              </option>
            ))}
          </select>
        </label>
        {children.length ? (
          <p className="memo-focus__children">Child {children.length}: {children.map((item) => memoTitleOf(item) || item.id).join(", ")}</p>
        ) : null}
        <div className="memo-focus__blocks">
          {blocks.map((block) => (
            <section key={block.id} className={`memo-block ${block.collapsed ? "is-collapsed" : ""}`}>
              <div className="memo-block__bar">
                <strong>{block.type === "text" ? "Text" : "Object Link"}</strong>
                <button type="button" onClick={() => onEdit({ type: "moveMemoBlock", objectId: memo.id, blockId: block.id, direction: -1 })}>
                  ↑
                </button>
                <button type="button" onClick={() => onEdit({ type: "moveMemoBlock", objectId: memo.id, blockId: block.id, direction: 1 })}>
                  ↓
                </button>
                <button type="button" onClick={() => onEdit({ type: "toggleMemoBlock", objectId: memo.id, blockId: block.id })}>
                  {block.collapsed ? "펼치기" : "접기"}
                </button>
                <button type="button" onClick={() => onEdit({ type: "removeMemoBlock", objectId: memo.id, blockId: block.id })}>
                  삭제
                </button>
              </div>
              {block.collapsed ? null : block.type === "text" ? (
                <textarea
                  className="memo-block__text"
                  value={block.content}
                  data-testid={`memo-${memo.id}-text-${block.id}`}
                  onChange={(event) =>
                    onEdit({
                      type: "updateMemoBlock",
                      objectId: memo.id,
                      blockId: block.id,
                      patch: { content: event.target.value },
                    })
                  }
                />
              ) : (
                <ObjectLinkBlockView
                  memo={memo}
                  linkIds={block.linkIds}
                  project={project}
                  onEdit={onEdit}
                  onFocusObject={onFocusObject}
                  blockId={block.id}
                />
              )}
            </section>
          ))}
        </div>
        <div className="memo-focus__add">
          <span>/ Add block</span>
          <button type="button" data-testid={`memo-${memo.id}-add-text`} onClick={() => onEdit({ type: "addMemoBlock", objectId: memo.id, blockType: "text" })}>
            Text
          </button>
          <button
            type="button"
            data-testid={`memo-${memo.id}-add-object-link`}
            onClick={() => onEdit({ type: "addMemoBlock", objectId: memo.id, blockType: "object-link" })}
          >
            Object Link
          </button>
        </div>
      </div>
    </div>
  );
}

function ObjectLinkBlockView({
  memo,
  linkIds,
  project,
  onEdit,
  onFocusObject,
  blockId,
}: {
  memo: MemoObject;
  linkIds: string[];
  project: ProjectDocument;
  onEdit: (edit: WorkspaceEdit) => void;
  onFocusObject: (objectId: string) => void;
  blockId: string;
}) {
  const byId = new Map(project.objects.map((item) => [item.id, item]));
  return (
    <div className="memo-links">
      {linkIds.map((linkId) => {
        const link = memo.links.find((item) => item.id === linkId);
        const target = link ? byId.get(link.targetObjectId) : undefined;
        return (
          <button
            key={linkId}
            type="button"
            className={`memo-link-row ${target ? "" : "is-missing"}`}
            onClick={() => target && onFocusObject(target.id)}
          >
            {target ? (
              <>
                <strong>{labelOf(target)}</strong>
                <span>{objectKindOf(target)}</span>
                <span>{target.id}</span>
              </>
            ) : (
              <span>Missing {link?.targetObjectId ?? linkId}</span>
            )}
          </button>
        );
      })}
      <select
        data-testid={`memo-${memo.id}-link-pick-${blockId}`}
        defaultValue=""
        onChange={(event) => {
          const targetId = event.target.value;
          event.target.value = "";
          if (!targetId) return;
          const target = byId.get(targetId);
          if (!target) return;
          onEdit({
            type: "connectMemoLink",
            sourceMemoId: memo.id,
            targetObjectId: target.id,
            relation: "reference",
            blockId,
          });
        }}
      >
        <option value="">객체 연결…</option>
        {project.objects
          .filter((item) => item.id !== memo.id)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {labelOf(item)} ({objectKindOf(item)})
            </option>
          ))}
      </select>
    </div>
  );
}

function labelOf(object: WorksheetObject): string {
  if (object.kind === "memo") return object.title?.trim() || object.id;
  return object.name;
}
