import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

export type ArrangementLinkEdgeType = Edge<{ pointId: string; end: string }, "arrangementLink">;

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
}: EdgeProps<ArrangementLinkEdgeType>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
  });
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className="arr-point-link" />;
}
