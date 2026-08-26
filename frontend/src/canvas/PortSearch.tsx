import { useMemo, useState } from "react";
import type { ProjectDocument } from "../types/contract";
import { searchSourcePorts, searchTargetPorts, type PortSearchHit } from "../lib/objectSearch";

export function PortSearch({
  project,
  selfObjectId,
  direction,
  onPick,
  testId,
}: {
  project: ProjectDocument;
  selfObjectId: string;
  direction: "to-input" | "from-output";
  onPick: (hit: PortSearchHit) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = useMemo(
    () =>
      direction === "to-input"
        ? searchTargetPorts(project, query, selfObjectId)
        : searchSourcePorts(project, query, selfObjectId),
    [direction, project, query, selfObjectId],
  );

  return (
    <div className="port-search nodrag nopan">
      <button
        type="button"
        className="port-search__btn nodrag"
        data-testid={testId}
        title="오브젝트 검색 후 연결"
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
      >
        ⌕
      </button>
      {open ? (
        <div className="port-search__pop nodrag nopan nowheel" data-testid={`${testId}-pop`}>
          <input
            className="port-search__query nodrag nopan"
            value={query}
            data-testid={`${testId}-query`}
            placeholder="오브젝트 ID / 이름"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            autoFocus
          />
          {hits.length === 0 ? <p className="port-search__empty">검색 결과 없음</p> : null}
          <ul className="port-search__list">
            {hits.map((hit) => (
              <li key={`${hit.objectId}:${hit.variableId || "new"}:${hit.createInput ? "create" : "port"}`}>
                <button
                  type="button"
                  className="port-search__hit nodrag"
                  data-testid={`${testId}-hit-${hit.objectId}-${hit.createInput ? "new" : hit.variableId}`}
                  onClick={() => {
                    onPick(hit);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="port-search__object">
                    {hit.objectId}
                    {hit.objectName !== hit.objectId ? ` · ${hit.objectName}` : ""}
                  </span>
                  <span className="port-search__var">{hit.variableName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
