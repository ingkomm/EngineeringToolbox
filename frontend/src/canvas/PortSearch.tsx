import { useMemo, useState } from "react";
import type { ProjectDocument } from "../types/contract";
import {
  searchSourcePorts,
  searchTargetPorts,
  type PortLinkStatus,
  type PortSearchHit,
} from "../lib/objectSearch";

const STATUS_LABEL: Record<PortLinkStatus, string | null> = {
  connected: "연결됨",
  occupied: "사용 중",
  available: null,
  create: null,
};

export function PortSearch({
  project,
  selfObjectId,
  selfVariableId,
  direction,
  onPick,
  onDisconnect,
  testId,
}: {
  project: ProjectDocument;
  selfObjectId: string;
  selfVariableId: string;
  direction: "to-input" | "from-output";
  onPick: (hit: PortSearchHit) => void;
  onDisconnect: (hit: PortSearchHit) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = useMemo(
    () =>
      direction === "to-input"
        ? searchTargetPorts(project, query, selfObjectId, selfVariableId)
        : searchSourcePorts(project, query, selfObjectId, selfVariableId),
    [direction, project, query, selfObjectId, selfVariableId],
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
            {hits.map((hit) => {
              const statusLabel = STATUS_LABEL[hit.status];
              const canConnect = hit.status === "available" || hit.status === "create";
              const hitKey = `${hit.objectId}:${hit.variableId || "new"}:${hit.createInput ? "create" : "port"}`;
              const hitTestId = `${testId}-hit-${hit.objectId}-${hit.createInput ? "new" : hit.variableId}`;
              return (
                <li key={hitKey} className="port-search__row">
                  {canConnect ? (
                    <button
                      type="button"
                      className="port-search__hit nodrag"
                      data-testid={hitTestId}
                      onClick={() => {
                        onPick(hit);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <HitBody hit={hit} statusLabel={statusLabel} testId={testId} />
                    </button>
                  ) : (
                    <div
                      className={`port-search__hit port-search__hit--static port-search__hit--${hit.status}`}
                      data-testid={hitTestId}
                    >
                      <HitBody hit={hit} statusLabel={statusLabel} testId={testId} />
                    </div>
                  )}
                  {hit.status === "connected" && hit.edgeId ? (
                    <button
                      type="button"
                      className="port-search__disconnect nodrag"
                      data-testid={`${testId}-disconnect-${hit.objectId}-${hit.variableId}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDisconnect(hit);
                      }}
                    >
                      끊기
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function HitBody({
  hit,
  statusLabel,
  testId,
}: {
  hit: PortSearchHit;
  statusLabel: string | null;
  testId: string;
}) {
  return (
    <>
      <span className="port-search__object">
        {hit.objectId}
        {hit.objectName !== hit.objectId ? ` · ${hit.objectName}` : ""}
      </span>
      <span className="port-search__var">{hit.variableName}</span>
      {statusLabel ? (
        <span
          className={`port-search__status port-search__status--${hit.status}`}
          data-testid={`${testId}-status-${hit.objectId}-${hit.variableId || "new"}`}
        >
          {statusLabel}
        </span>
      ) : null}
    </>
  );
}
