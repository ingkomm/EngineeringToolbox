import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { ArrangementLinkKind } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";

export type ArrangementLinkEdgeType = Edge<
  {
    pointId: string;
    end: string;
    reversed?: boolean;
    linkKind?: ArrangementLinkKind;
    showArrow?: boolean;
    waypoints?: Array<{ x: number; y: number }>;
    onEdit?: (edit: WorkspaceEdit) => void;
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
  data,
  selected,
}: EdgeProps<ArrangementLinkEdgeType>) {
  const [hovered, setHovered] = useState(false);
  const reactFlow = useReactFlow();
  const waypoints = data?.waypoints ?? [];
  const kind = data?.linkKind === "signal" ? "signal" : "pipe";
  const points = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
  const path =
    waypoints.length === 0
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 0,
        })[0]
      : orthogonalPath(points);
  const mid = waypoints[0] ?? { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={data?.showArrow ? markerEnd : undefined}
        className={`arr-point-link arr-point-link--${kind}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        {waypoints.map((point, index) => (
          <button
            key={`${point.x}:${point.y}:${index}`}
            type="button"
            className="pid-waypoint nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
              const handleUp = (move: PointerEvent) => {
                window.removeEventListener("pointerup", handleUp);
                const next = reactFlow.screenToFlowPosition({ x: move.clientX, y: move.clientY });
                data?.onEdit?.({
                  type: "updatePointEnd",
                  pointId: data.pointId,
                  end: data.end,
                  patch: { waypoints: waypoints.map((item, itemIndex) => (itemIndex === index ? next : item)) },
                });
              };
              window.addEventListener("pointerup", handleUp);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              data?.onEdit?.({
                type: "updatePointEnd",
                pointId: data.pointId,
                end: data.end,
                patch: { waypoints: waypoints.filter((_, itemIndex) => itemIndex !== index) },
              });
            }}
          />
        ))}
        <div
          className={`edge-controls nodrag nopan ${selected || hovered ? "is-visible" : ""}`}
          style={{
            position: "absolute",
            transform: `translate(-50%, -140%) translate(${mid.x}px, ${mid.y}px)`,
            pointerEvents: "all",
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            type="button"
            className="edge-toggle nodrag nopan"
            data-testid={`edge-${id}-waypoint`}
            title="중간점 추가"
            onClick={() =>
              data?.onEdit?.({
                type: "updatePointEnd",
                pointId: data.pointId,
                end: data.end,
                patch: { waypoints: [...waypoints, mid] },
              })
            }
          >
            +
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function orthogonalPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const curr = points[index]!;
    d += ` L ${curr.x} ${prev.y} L ${curr.x} ${curr.y}`;
  }
  return d;
}
