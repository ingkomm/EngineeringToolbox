import { useState, type DragEvent, type ReactNode } from "react";
import type { ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { encodeLibraryDrag, libraryPlaceEdit, type LibraryDragPayload } from "../lib/libraryPlace";
import {
  categoryOf,
  libraryFolders,
  libraryOf,
  nextLibrarySymbolId,
  symbolsInFolder,
  type LibrarySymbol,
} from "./symbols/library";
import { resolveDrawing, withPorts } from "./symbols/drawing";
import { renderLibrarySymbol, renderSystemLibraryTile } from "./symbols/registry";
import { SymbolEditor } from "./symbols/SymbolEditor";

function parentFolder(path: string): string {
  if (!path.includes("/")) return "";
  return path.split("/").slice(0, -1).join("/");
}

export function IsoSymbolSidebar({
  project,
  onEdit,
}: {
  project: ProjectDocument;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const library = libraryOf(project);
  const folders = libraryFolders(library, project.symbolCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeFolder, setActiveFolder] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const editing = library.find((item) => item.id === editingId && item.kind === "equipment");
  const roots = folders.filter((path) => !path.includes("/"));

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
            onEdit({ type: "addLibrarySymbol", category: activeFolder || undefined });
            setEditingId(id);
            setPendingDelete(null);
          }}
        >
          Create
        </button>
        <div className="iso-sidebar__folder-add">
          <input
            className="iso-sidebar__search"
            value={folderDraft}
            placeholder="폴더 / 하위경로"
            data-testid="library-folder-name"
            onChange={(event) => setFolderDraft(event.target.value)}
          />
          <button
            type="button"
            className="iso-sidebar__mini"
            data-testid="btn-add-library-folder"
            onClick={() => {
              const path = folderDraft.trim();
              if (!path) return;
              onEdit({ type: "addLibraryCategory", path });
              setActiveFolder(path);
              setFolderDraft("");
            }}
          >
            폴더
          </button>
        </div>
      </header>
      <div className="iso-sidebar__groups">
        <section className="iso-sidebar__system" data-testid="library-system">
          <p className="iso-sidebar__section">SYSTEM</p>
          <SystemTile
            testId="btn-add-point"
            name="Point"
            payload={{ place: "point" }}
            onEdit={onEdit}
          >
            {renderSystemLibraryTile("point")}
          </SystemTile>
          <SystemTile
            testId="btn-add-calculation"
            name="Calculation"
            payload={{ place: "calculation" }}
            onEdit={onEdit}
          >
            {renderSystemLibraryTile("calculation")}
          </SystemTile>
          <SystemTile
            testId="btn-add-memo"
            name="Memo"
            payload={{ place: "memo" }}
            onEdit={onEdit}
          >
            {renderSystemLibraryTile("memo")}
          </SystemTile>
        </section>
        <p className="iso-sidebar__section">ARRANGEMENT SYMBOLS</p>
        <FolderBlock
          title="라이브러리"
          folder=""
          allFolders={folders}
          active={activeFolder === ""}
          onSelect={() => setActiveFolder("")}
          symbols={symbolsInFolder(library, "")}
          editingId={editingId}
          pendingDelete={pendingDelete}
          setEditingId={setEditingId}
          setPendingDelete={setPendingDelete}
          onEdit={onEdit}
        />
        {roots.map((root) => (
          <FolderTree
            key={root}
            path={root}
            folders={folders}
            library={library}
            depth={0}
            collapsed={collapsed}
            activeFolder={activeFolder}
            editingId={editingId}
            pendingDelete={pendingDelete}
            setCollapsed={setCollapsed}
            setActiveFolder={setActiveFolder}
            setEditingId={setEditingId}
            setPendingDelete={setPendingDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
      {editing ? (
        <SymbolEditor
          symbolId={editing.id}
          name={editing.name}
          drawing={withPorts(resolveDrawing(editing.id, editing.drawing), editing.inCount ?? 1, editing.outCount ?? 1)}
          inCount={editing.inCount ?? 1}
          outCount={editing.outCount ?? 1}
          onChangeName={(name) => onEdit({ type: "updateLibrarySymbol", symbolId: editing.id, patch: { name } })}
          onPatch={(patch) => onEdit({ type: "updateLibrarySymbol", symbolId: editing.id, patch })}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </aside>
  );
}

function FolderTree({
  path,
  folders,
  library,
  depth,
  collapsed,
  activeFolder,
  editingId,
  pendingDelete,
  setCollapsed,
  setActiveFolder,
  setEditingId,
  setPendingDelete,
  onEdit,
}: {
  path: string;
  folders: string[];
  library: LibrarySymbol[];
  depth: number;
  collapsed: Record<string, boolean>;
  activeFolder: string;
  editingId: string | null;
  pendingDelete: string | null;
  setCollapsed: (value: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void;
  setActiveFolder: (path: string) => void;
  setEditingId: (id: string | null) => void;
  setPendingDelete: (id: string | null) => void;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const childFolders = folders.filter((item) => item.startsWith(`${path}/`) && item.slice(path.length + 1).split("/").length === 1);
  const isOpen = collapsed[path] !== true;
  const title = path.split("/").at(-1) ?? path;
  return (
    <div className="iso-sidebar__folder" style={{ paddingLeft: depth * 8 }}>
      <div className={`iso-sidebar__folder-head ${activeFolder === path ? "is-active" : ""}`}>
        <button
          type="button"
          className="iso-sidebar__folder-toggle"
          data-testid={`btn-toggle-folder-${path}`}
          onClick={() => setCollapsed((current) => ({ ...current, [path]: isOpen }))}
        >
          {isOpen ? "▾" : "▸"}
        </button>
        <button type="button" className="iso-sidebar__folder-name" onClick={() => setActiveFolder(path)}>
          {title}
        </button>
        {pendingDelete === `folder:${path}` ? (
          <>
            <button
              type="button"
              className="iso-sidebar__mini"
              data-testid={`btn-cancel-delete-folder-${path}`}
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(null);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="iso-sidebar__mini iso-sidebar__mini--danger"
              data-testid={`btn-confirm-delete-folder-${path}`}
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(null);
                if (activeFolder === path || activeFolder.startsWith(`${path}/`)) setActiveFolder(parentFolder(path));
                onEdit({ type: "deleteLibraryCategory", path });
              }}
            >
              확인
            </button>
          </>
        ) : (
          <button
            type="button"
            className="iso-sidebar__mini iso-sidebar__mini--danger"
            data-testid={`btn-delete-folder-${path}`}
            title="폴더 삭제"
            onClick={(event) => {
              event.stopPropagation();
              setPendingDelete(`folder:${path}`);
            }}
          >
            삭제
          </button>
        )}
      </div>
      {isOpen ? (
        <>
          <FolderBlock
            folder={path}
            allFolders={folders}
            active={activeFolder === path}
            symbols={symbolsInFolder(library, path)}
            editingId={editingId}
            pendingDelete={pendingDelete}
            setEditingId={setEditingId}
            setPendingDelete={setPendingDelete}
            onEdit={onEdit}
          />
          {childFolders.map((child) => (
            <FolderTree
              key={child}
              path={child}
              folders={folders}
              library={library}
              depth={depth + 1}
              collapsed={collapsed}
              activeFolder={activeFolder}
              editingId={editingId}
              pendingDelete={pendingDelete}
              setCollapsed={setCollapsed}
              setActiveFolder={setActiveFolder}
              setEditingId={setEditingId}
              setPendingDelete={setPendingDelete}
              onEdit={onEdit}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function startLibraryDrag(event: DragEvent, payload: LibraryDragPayload) {
  event.dataTransfer.setData("text/plain", encodeLibraryDrag(payload));
  event.dataTransfer.effectAllowed = "copy";
}

function SystemTile({
  testId,
  name,
  payload,
  onEdit,
  children,
}: {
  testId: string;
  name: string;
  payload: LibraryDragPayload;
  onEdit: (edit: WorkspaceEdit) => void;
  children: ReactNode;
}) {
  return (
    <div className="iso-sidebar__row iso-sidebar__row--system">
      <button
        type="button"
        className="iso-sidebar__tile"
        title={name}
        data-testid={testId}
        draggable
        onDragStart={(event) => startLibraryDrag(event, payload)}
        onClick={() => onEdit(libraryPlaceEdit(payload))}
      >
        <span className="iso-sidebar__icon">{children}</span>
        <span className="iso-sidebar__name">{name}</span>
      </button>
    </div>
  );
}

function FolderBlock({
  title,
  allFolders,
  active,
  onSelect,
  symbols,
  editingId,
  pendingDelete,
  setEditingId,
  setPendingDelete,
  onEdit,
}: {
  title?: string;
  folder?: string;
  allFolders: string[];
  active: boolean;
  onSelect?: () => void;
  symbols: LibrarySymbol[];
  editingId: string | null;
  pendingDelete: string | null;
  setEditingId: (id: string | null) => void;
  setPendingDelete: (id: string | null) => void;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const folderChoices = ["", ...allFolders];
  return (
    <div className={`iso-sidebar__folder-body ${active ? "is-active" : ""}`}>
      {title && onSelect ? (
        <button type="button" className={`iso-sidebar__folder-name iso-sidebar__folder-name--root ${active ? "is-active" : ""}`} onClick={onSelect}>
          {title}
        </button>
      ) : null}
      {symbols.map((item) => (
        <div key={item.id} className={`iso-sidebar__row ${editingId === item.id ? "is-editing" : ""}`}>
          <button
            type="button"
            className="iso-sidebar__tile"
            title={item.name}
            data-testid={`btn-add-equipment-${item.id}`}
            draggable
            onDragStart={(event) => startLibraryDrag(event, { place: "equipment", symbolId: item.id })}
            onClick={() => onEdit(libraryPlaceEdit({ place: "equipment", symbolId: item.id }))}
          >
            <span className="iso-sidebar__icon">{renderLibrarySymbol(item)}</span>
            <span className="iso-sidebar__name">{item.name}</span>
          </button>
          <div className="iso-sidebar__actions">
            <button
              type="button"
              className="iso-sidebar__mini"
              data-testid={`btn-symbol-up-${item.id}`}
              title="위로"
              onClick={(event) => {
                event.stopPropagation();
                onEdit({ type: "moveLibrarySymbol", symbolId: item.id, direction: -1 });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="iso-sidebar__mini"
              data-testid={`btn-symbol-down-${item.id}`}
              title="아래로"
              onClick={(event) => {
                event.stopPropagation();
                onEdit({ type: "moveLibrarySymbol", symbolId: item.id, direction: 1 });
              }}
            >
              ↓
            </button>
            <select
              className="iso-sidebar__cat"
              aria-label="카테고리"
              data-testid={`select-symbol-category-${item.id}`}
              value={categoryOf(item)}
              onChange={(event) =>
                onEdit({ type: "updateLibrarySymbol", symbolId: item.id, patch: { category: event.target.value } })
              }
            >
              <option value="">라이브러리</option>
              {folderChoices.filter(Boolean).map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="iso-sidebar__mini"
              data-testid={`btn-edit-symbol-${item.id}`}
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(null);
                setEditingId(item.id === editingId ? null : item.id);
              }}
            >
              편집
            </button>
            {pendingDelete === item.id ? (
              <>
                <button
                  type="button"
                  className="iso-sidebar__mini"
                  data-testid={`btn-cancel-delete-symbol-${item.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPendingDelete(null);
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="iso-sidebar__mini iso-sidebar__mini--danger"
                  data-testid={`btn-confirm-delete-symbol-${item.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (editingId === item.id) setEditingId(null);
                    setPendingDelete(null);
                    onEdit({ type: "deleteLibrarySymbol", symbolId: item.id });
                  }}
                >
                  확인
                </button>
              </>
            ) : (
              <button
                type="button"
                className="iso-sidebar__mini iso-sidebar__mini--danger"
                data-testid={`btn-delete-symbol-${item.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDelete(item.id);
                }}
              >
                삭제
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
