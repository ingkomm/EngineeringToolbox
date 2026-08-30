import { useState } from "react";
import type { ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { libraryOf, nextLibrarySymbolId } from "./symbols/library";
import { resolveDrawing } from "./symbols/drawing";
import { renderLibrarySymbol } from "./symbols/registry";
import { SymbolEditor } from "./symbols/SymbolEditor";

export function IsoSymbolSidebar({
  project,
  onEdit,
}: {
  project: ProjectDocument;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const library = libraryOf(project);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = library.find((item) => item.id === editingId && item.kind === "equipment");

  return (
    <aside className="iso-sidebar" data-testid="iso-sidebar">
      <header className="iso-sidebar__head">
        <p className="iso-sidebar__kicker">Library</p>
        <h2>심볼</h2>
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-create-symbol"
          onClick={() => {
            const id = nextLibrarySymbolId(library);
            onEdit({ type: "addLibrarySymbol" });
            setEditingId(id);
          }}
        >
          Create
        </button>
      </header>
      <div className="iso-sidebar__groups">
        {library.map((item) => (
          <div key={item.id} className={`iso-sidebar__row ${editingId === item.id ? "is-editing" : ""}`}>
            <button
              type="button"
              className="iso-sidebar__tile"
              title={item.name}
              data-testid={item.kind === "point" ? "btn-add-point" : `btn-add-equipment-${item.id}`}
              onClick={() =>
                onEdit(item.kind === "point" ? { type: "addPoint" } : { type: "addEquipment", symbolId: item.id })
              }
            >
              <span className="iso-sidebar__icon">{renderLibrarySymbol(item)}</span>
              <span className="iso-sidebar__name">{item.name}</span>
            </button>
            <div className="iso-sidebar__actions">
              {item.kind === "equipment" ? (
                <button
                  type="button"
                  className="ghost-btn"
                  data-testid={`btn-edit-symbol-${item.id}`}
                  onClick={() => setEditingId(item.id === editingId ? null : item.id)}
                >
                  편집
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-btn ghost-btn--danger"
                data-testid={`btn-delete-symbol-${item.id}`}
                onClick={() => {
                  if (editingId === item.id) setEditingId(null);
                  onEdit({ type: "deleteLibrarySymbol", symbolId: item.id });
                }}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <SymbolEditor
          symbolId={editing.id}
          name={editing.name}
          drawing={resolveDrawing(editing.id, editing.drawing)}
          onChangeName={(name) => onEdit({ type: "updateLibrarySymbol", symbolId: editing.id, patch: { name } })}
          onChange={(drawing) => onEdit({ type: "updateLibrarySymbol", symbolId: editing.id, patch: { drawing } })}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </aside>
  );
}
