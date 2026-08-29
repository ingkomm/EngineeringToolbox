import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

export type ArrangementLinkEdgeType = Edge<
  {
    pointId: string;
    end: string;
    reversed?: boolean;
    onToggleDirection?: (pointId: string, end: string) => void;
  },
  "arrangementLink"
>;

export function ArrangementLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<ArrangementLinkEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className="arr-point-link" />
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
            className="edge-toggle nodrag nopan"
            data-testid={`edge-${id}-direction`}
            title="연결 방향 바꾸기"
            onClick={() => data?.onToggleDirection?.(data.pointId, data.end)}
          >
            방향
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
