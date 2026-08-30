import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function MemoLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return <BaseEdge id={id} path={path} className="memo-link-edge__path" />;
}
