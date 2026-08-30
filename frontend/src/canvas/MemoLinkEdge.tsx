import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

export type MemoLinkEdgeType = Edge<Record<string, never>, "memoLink">;

export function MemoLinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }: EdgeProps<MemoLinkEdgeType>) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      className="memo-link-edge"
      style={{ ...style, stroke: "#94a3b8", strokeWidth: 1.2, strokeDasharray: "4 3" }}
    />
  );
}
