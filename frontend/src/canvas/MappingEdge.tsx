import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

export type MappingEdgeType = Edge<
  {
    enabled: boolean;
    onToggle: (edgeId: string) => void;
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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={enabled ? "mapping-edge" : "mapping-edge mapping-edge--off"}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`edge-toggle nodrag nopan ${enabled ? "" : "edge-toggle--off"}`}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          data-testid={`edge-${id}-toggle`}
          onClick={() => data?.onToggle(id)}
        >
          {enabled ? "On" : "Off"}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
