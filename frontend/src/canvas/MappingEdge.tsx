import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

export type MappingEdgeType = Edge<
  {
    enabled: boolean;
    collapsed: boolean;
    sourceObjectId: string;
    sourceObjectName: string;
    targetObjectId: string;
    targetObjectName: string;
    onToggle: (edgeId: string) => void;
    onToggleCollapsed: (edgeId: string) => void;
  },
  "mapping"
>;

export function MappingEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<MappingEdgeType>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const enabled = data?.enabled !== false;
  const collapsed = data?.collapsed === true;
  const sourceLabel = `${data?.sourceObjectId ?? ""}${data?.sourceObjectName && data.sourceObjectName !== data.sourceObjectId ? ` · ${data.sourceObjectName}` : ""}`;
  const targetLabel = `${data?.targetObjectId ?? ""}${data?.targetObjectName && data.targetObjectName !== data.targetObjectId ? ` · ${data.targetObjectName}` : ""}`;

  return (
    <>
      {collapsed ? null : (
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          className={enabled ? "mapping-edge" : "mapping-edge mapping-edge--off"}
        />
      )}
      <EdgeLabelRenderer>
        {collapsed ? (
          <>
            <div
              className={`link-chip nodrag nopan ${enabled ? "" : "link-chip--off"}`}
              style={{
                position: "absolute",
                transform: `translate(12px, -50%) translate(${sourceX}px, ${sourceY}px)`,
                pointerEvents: "all",
              }}
              data-testid={`edge-${id}-chip-source`}
            >
              <span className="link-chip__arrow">→</span>
              <span className="link-chip__peer">{targetLabel}</span>
              <button
                type="button"
                className="link-chip__btn nodrag"
                data-testid={`edge-${id}-expand`}
                title="전체 링크로 펼치기"
                onClick={() => data?.onToggleCollapsed(id)}
              >
                펼치기
              </button>
            </div>
            <div
              className={`link-chip nodrag nopan ${enabled ? "" : "link-chip--off"}`}
              style={{
                position: "absolute",
                transform: `translate(calc(-100% - 12px), -50%) translate(${targetX}px, ${targetY}px)`,
                pointerEvents: "all",
              }}
              data-testid={`edge-${id}-chip-target`}
            >
              <span className="link-chip__peer">{sourceLabel}</span>
              <span className="link-chip__arrow">→</span>
              <button
                type="button"
                className="link-chip__btn nodrag"
                data-testid={`edge-${id}-expand-target`}
                title="전체 링크로 펼치기"
                onClick={() => data?.onToggleCollapsed(id)}
              >
                펼치기
              </button>
            </div>
          </>
        ) : (
          <div
            className="edge-controls nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -140%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              type="button"
              className={`edge-toggle nodrag nopan ${enabled ? "" : "edge-toggle--off"}`}
              data-testid={`edge-${id}-toggle`}
              onClick={() => data?.onToggle(id)}
            >
              {enabled ? "On" : "Off"}
            </button>
            <button
              type="button"
              className="edge-toggle edge-toggle--link nodrag nopan"
              data-testid={`edge-${id}-collapse`}
              title="무선 링크로 접기"
              onClick={() => data?.onToggleCollapsed(id)}
            >
              링크
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
