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

  if (collapsed) {
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        className="mapping-edge mapping-edge--collapsed"
        style={{ stroke: "transparent", strokeWidth: 0 }}
      />
    );
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={enabled ? "mapping-edge" : "mapping-edge mapping-edge--off"}
      />
      <EdgeLabelRenderer>
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
      </EdgeLabelRenderer>
    </>
  );
}
