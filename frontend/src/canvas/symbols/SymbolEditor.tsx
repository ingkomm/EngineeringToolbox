import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PortAnchor, SymbolDrawing, SymbolPrimitive } from "./drawing";
import {
  nextPrimitiveId,
  portXY,
  resizeDrawing,
  snapPortToBorder,
  withPorts,
} from "./drawing";
import { CANVAS_GRID, gridLinesToSize, sizeToGridLines, snapToGrid } from "./grid";
import { DrawingPrimitives } from "./DrawingSvg";
import type { EquipmentObject } from "../../types/contract";

type Tool = "select" | "line" | "circle" | "polygon";

export function SymbolEditor({
  name,
  drawing,
  inCount,
  outCount,
  onChangeName,
  onPatch,
  onClose,
}: {
  symbolId: string;
  name: string;
  drawing: SymbolDrawing;
  inCount: number;
  outCount: number;
  onChangeName?: (name: string) => void;
  onPatch: (patch: {
    name?: string;
    inCount?: number;
    outCount?: number;
    drawing?: EquipmentObject["drawing"];
  }) => void;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("line");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SymbolDrawing>(() => withPorts(drawing, inCount, outCount));
  const [ins, setIns] = useState(inCount);
  const [outs, setOuts] = useState(outCount);
  const [pending, setPending] = useState<Array<{ x: number; y: number }>>([]);
  const [rubber, setRubber] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    mode: "draw" | "move" | "vertex" | "port";
    start: { x: number; y: number };
    origin?: SymbolPrimitive;
    vertex?: number;
    portId?: string;
  } | null>(null);

  useEffect(() => {
    if (drag.current) return;
    setDraft(withPorts(drawing, inCount, outCount));
    setIns(inCount);
    setOuts(outCount);
  }, [drawing, inCount, outCount]);

  const commit = (next: SymbolDrawing, counts?: { inCount?: number; outCount?: number }) => {
    const portsOf = counts
      ? withPorts(next, counts.inCount ?? ins, counts.outCount ?? outs)
      : next;
    setDraft(portsOf);
    onPatch({ drawing: portsOf, ...counts });
  };

  const removeSelected = (id: string | null) => {
    if (!id) return;
    setDraft((current) => {
      const next = { ...current, primitives: current.primitives.filter((item) => item.id !== id) };
      onPatch({ drawing: next });
      return next;
    });
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape") {
        drag.current = null;
        setPending([]);
        setRubber(null);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        removeSelected(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPatch, selectedId]);

  const gridLines = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];
    for (let x = 0; x <= draft.width; x += CANVAS_GRID) {
      lines.push({ key: `v${x}`, x1: x, y1: 0, x2: x, y2: draft.height });
    }
    for (let y = 0; y <= draft.height; y += CANVAS_GRID) {
      lines.push({ key: `h${y}`, x1: 0, y1: y, x2: draft.width, y2: y });
    }
    return lines;
  }, [draft.height, draft.width]);

  const pointFromClient = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const box = svg.getBoundingClientRect();
    return {
      x: snapToGrid(((event.clientX - box.left) / box.width) * draft.width),
      y: snapToGrid(((event.clientY - box.top) / box.height) * draft.height),
    };
  };

  const preview = (item: SymbolPrimitive) => {
    setDraft({ ...draft, primitives: draft.primitives.map((entry) => (entry.id === item.id ? item : entry)) });
  };

  const previewPort = (port: PortAnchor) => {
    setDraft({
      ...draft,
      ports: (draft.ports ?? []).map((item) => (item.id === port.id ? port : item)),
    });
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromClient(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "line" || tool === "circle") {
      drag.current = { mode: "draw", start: point };
      setPending([point]);
      setRubber(point);
      return;
    }
    if (tool === "polygon") {
      if (pending.length >= 2 && point.x === pending[0]!.x && point.y === pending[0]!.y) {
        finishPolygon();
        return;
      }
      setPending((current) => [...current, point]);
      return;
    }
    const hit = selectedId ? draft.primitives.find((item) => item.id === selectedId) : undefined;
    if (hit) drag.current = { mode: "move", start: point, origin: hit };
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromClient(event);
    const active = drag.current;
    if (!active) {
      if (tool === "polygon" && pending.length) setRubber(point);
      return;
    }
    if (active.mode === "draw") {
      setRubber(point);
      return;
    }
    if (active.mode === "port" && active.portId) {
      const snapped = snapPortToBorder(point.x, point.y, draft.width, draft.height);
      previewPort({ id: active.portId, ...snapped });
      return;
    }
    if (active.mode === "move" && active.origin && selectedId) {
      preview(translatePrimitive(active.origin, point.x - active.start.x, point.y - active.start.y));
    }
    if (active.mode === "vertex" && active.origin && selectedId && active.vertex != null) {
      preview(moveVertex(active.origin, active.vertex, point));
    }
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromClient(event);
    const active = drag.current;
    drag.current = null;
    if (!active) return;
    if (active.mode === "draw" && (tool === "line" || tool === "circle")) {
      if (tool === "line" && (point.x !== active.start.x || point.y !== active.start.y)) {
        const item: SymbolPrimitive = {
          id: nextPrimitiveId(draft, "line"),
          kind: "line",
          x1: active.start.x,
          y1: active.start.y,
          x2: point.x,
          y2: point.y,
        };
        commit({ ...draft, primitives: [...draft.primitives, item] });
        setSelectedId(item.id);
      }
      if (tool === "circle") {
        const r = Math.max(CANVAS_GRID, snapToGrid(Math.hypot(point.x - active.start.x, point.y - active.start.y)));
        const item: SymbolPrimitive = {
          id: nextPrimitiveId(draft, "circle"),
          kind: "circle",
          cx: active.start.x,
          cy: active.start.y,
          r,
        };
        commit({ ...draft, primitives: [...draft.primitives, item] });
        setSelectedId(item.id);
      }
      setPending([]);
      setRubber(null);
      return;
    }
    if (active.mode === "port" && active.portId) {
      const snapped = snapPortToBorder(point.x, point.y, draft.width, draft.height);
      commit({
        ...draft,
        ports: (draft.ports ?? []).map((item) => (item.id === active.portId ? { id: active.portId, ...snapped } : item)),
      });
      return;
    }
    if ((active.mode === "move" || active.mode === "vertex") && active.origin && selectedId) {
      const nextItem =
        active.mode === "move"
          ? translatePrimitive(active.origin, point.x - active.start.x, point.y - active.start.y)
          : moveVertex(active.origin, active.vertex ?? 0, point);
      commit({ ...draft, primitives: draft.primitives.map((entry) => (entry.id === nextItem.id ? nextItem : entry)) });
    }
  };

  const finishPolygon = () => {
    if (pending.length < 3) return;
    const item: SymbolPrimitive = { id: nextPrimitiveId(draft, "poly"), kind: "polygon", points: pending };
    commit({ ...draft, primitives: [...draft.primitives, item] });
    setSelectedId(item.id);
    setPending([]);
    setRubber(null);
    setTool("select");
  };

  const setCount = (kind: "in" | "out", value: number) => {
    const nextIn = kind === "in" ? clampCount(value) : ins;
    const nextOut = kind === "out" ? clampCount(value) : outs;
    setIns(nextIn);
    setOuts(nextOut);
    commit(draft, { inCount: nextIn, outCount: nextOut });
  };

  const setGrid = (axis: "x" | "y", lines: number) => {
    const width = axis === "x" ? gridLinesToSize(lines) : draft.width;
    const height = axis === "y" ? gridLinesToSize(lines) : draft.height;
    commit(resizeDrawing(draft, width, height));
  };

  const selected = draft.primitives.find((item) => item.id === selectedId);
  const ports = draft.ports ?? [];

  return (
    <div className="symbol-editor symbol-editor--dock nodrag nopan" data-testid="symbol-editor">
      <header>
        <strong>심볼 편집</strong>
        <button type="button" className="ghost-btn" data-testid="symbol-editor-done" onClick={onClose}>
          완료
        </button>
      </header>
      {onChangeName ? (
        <input
          className="iso-sidebar__search"
          value={name}
          data-testid="symbol-editor-name"
          onChange={(event) => onChangeName(event.target.value)}
        />
      ) : null}
      <div className="symbol-editor__meta">
        <label className="symbol-editor__field">
          그리드
          <input
            type="number"
            min={3}
            max={21}
            value={sizeToGridLines(draft.width)}
            data-testid="symbol-grid-x"
            onChange={(event) => setGrid("x", Number(event.target.value))}
          />
          ×
          <input
            type="number"
            min={3}
            max={21}
            value={sizeToGridLines(draft.height)}
            data-testid="symbol-grid-y"
            onChange={(event) => setGrid("y", Number(event.target.value))}
          />
        </label>
        <label className="symbol-editor__field">
          In
          <input
            type="number"
            min={0}
            max={8}
            value={ins}
            data-testid="symbol-in-count"
            onChange={(event) => setCount("in", Number(event.target.value))}
          />
          Out
          <input
            type="number"
            min={0}
            max={8}
            value={outs}
            data-testid="symbol-out-count"
            onChange={(event) => setCount("out", Number(event.target.value))}
          />
        </label>
      </div>
      <div className="symbol-editor__tools">
        {(["select", "line", "circle", "polygon"] as Tool[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`ghost-btn ${tool === item ? "ghost-btn--on" : ""}`}
            data-testid={`symbol-tool-${item}`}
            onClick={() => {
              setTool(item);
              setPending([]);
              setRubber(null);
            }}
          >
            {item === "select" ? "이동" : item === "line" ? "직선" : item === "circle" ? "원" : "다각형"}
          </button>
        ))}
        <button type="button" className="ghost-btn" disabled={tool !== "polygon" || pending.length < 3} onClick={finishPolygon}>
          닫기
        </button>
        <button type="button" className="ghost-btn" disabled={!selectedId} onClick={() => removeSelected(selectedId)}>
          지우기
        </button>
      </div>
      <svg
        ref={svgRef}
        className="symbol-editor__canvas"
        viewBox={`0 0 ${draft.width} ${draft.height}`}
        data-testid="symbol-editor-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => {
          if (tool === "polygon") finishPolygon();
        }}
      >
        {gridLines.map((item) => (
          <line key={item.key} className="symbol-editor__grid" x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} />
        ))}
        <line className="symbol-editor__axis" x1={0} y1={draft.height / 2} x2={draft.width} y2={draft.height / 2} />
        <line className="symbol-editor__axis" x1={draft.width / 2} y1={0} x2={draft.width / 2} y2={draft.height} />
        <g className="symbol-editor__drawing" fill="none" stroke="currentColor" strokeWidth="1.7">
          <DrawingPrimitives drawing={draft} selectedId={selectedId} />
        </g>
        {draft.primitives.map((item) => (
          <g
            key={`hit-${item.id}`}
            onPointerDown={(event) => {
              if (tool !== "select") return;
              event.stopPropagation();
              setSelectedId(item.id);
              const point = pointFromClient(event);
              drag.current = { mode: "move", start: point, origin: item };
              svgRef.current?.setPointerCapture(event.pointerId);
            }}
          >
            <HitShape item={item} />
          </g>
        ))}
        {ports.map((port) => {
          const point = portXY(port, draft.width, draft.height);
          const inbound = port.id.startsWith("IN_");
          return (
            <g
              key={port.id}
              className={`symbol-editor__port ${inbound ? "symbol-editor__port--in" : "symbol-editor__port--out"}`}
              data-testid={`symbol-port-${port.id}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                drag.current = { mode: "port", start: pointFromClient(event), portId: port.id };
                svgRef.current?.setPointerCapture(event.pointerId);
              }}
            >
              <circle cx={point.x} cy={point.y} r={4} />
              <text x={point.x + (port.side === "right" ? -6 : 6)} y={point.y - 6} textAnchor={port.side === "right" ? "end" : "start"}>
                {port.id}
              </text>
            </g>
          );
        })}
        {selected?.kind === "line" ? (
          <>
            <VertexHandle x={selected.x1} y={selected.y1} onPointerDown={(event) => startVertex(event, selected, 0)} />
            <VertexHandle x={selected.x2} y={selected.y2} onPointerDown={(event) => startVertex(event, selected, 1)} />
          </>
        ) : null}
        {selected?.kind === "circle" ? (
          <VertexHandle x={selected.cx + selected.r} y={selected.cy} onPointerDown={(event) => startVertex(event, selected, 0)} />
        ) : null}
        {selected?.kind === "polygon"
          ? selected.points.map((point, index) => (
              <VertexHandle key={index} x={point.x} y={point.y} onPointerDown={(event) => startVertex(event, selected, index)} />
            ))
          : null}
        {tool === "line" && pending[0] && rubber ? (
          <line className="symbol-editor__rubber" x1={pending[0].x} y1={pending[0].y} x2={rubber.x} y2={rubber.y} />
        ) : null}
        {tool === "circle" && pending[0] && rubber ? (
          <circle
            className="symbol-editor__rubber"
            cx={pending[0].x}
            cy={pending[0].y}
            r={Math.max(CANVAS_GRID, snapToGrid(Math.hypot(rubber.x - pending[0].x, rubber.y - pending[0].y)))}
          />
        ) : null}
        {tool === "polygon" && pending.length ? (
          <polyline
            className="symbol-editor__rubber"
            fill="none"
            points={[...pending, rubber ?? pending[pending.length - 1]!].map((point) => `${point.x},${point.y}`).join(" ")}
          />
        ) : null}
      </svg>
      <p className="symbol-editor__hint">
        그리드는 선 개수입니다(기본 9×7). In/Out 점을 가장자리로 끌어 포트를 둡니다. 직선/원은 드래그, 다각형은 클릭 후 닫기.
      </p>
    </div>
  );

  function startVertex(event: PointerEvent<SVGCircleElement>, origin: SymbolPrimitive, vertex: number) {
    event.stopPropagation();
    drag.current = { mode: "vertex", start: pointFromClient(event), origin, vertex };
    svgRef.current?.setPointerCapture(event.pointerId);
  }
}

function clampCount(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

function translatePrimitive(item: SymbolPrimitive, dx: number, dy: number): SymbolPrimitive {
  if (item.kind === "line") return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
  if (item.kind === "circle") return { ...item, cx: item.cx + dx, cy: item.cy + dy };
  return { ...item, points: item.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
}

function moveVertex(item: SymbolPrimitive, index: number, point: { x: number; y: number }): SymbolPrimitive {
  if (item.kind === "line") {
    return index === 0 ? { ...item, x1: point.x, y1: point.y } : { ...item, x2: point.x, y2: point.y };
  }
  if (item.kind === "circle") {
    return { ...item, r: Math.max(CANVAS_GRID, snapToGrid(Math.hypot(point.x - item.cx, point.y - item.cy))) };
  }
  if (item.kind === "polygon") {
    return { ...item, points: item.points.map((entry, itemIndex) => (itemIndex === index ? point : entry)) };
  }
  return item;
}

function HitShape({ item }: { item: SymbolPrimitive }) {
  if (item.kind === "line") {
    return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth="10" />;
  }
  if (item.kind === "circle") {
    return <circle cx={item.cx} cy={item.cy} r={item.r} fill="transparent" stroke="transparent" strokeWidth="10" />;
  }
  return <polygon points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="transparent" stroke="transparent" strokeWidth="10" />;
}

function VertexHandle({
  x,
  y,
  onPointerDown,
}: {
  x: number;
  y: number;
  onPointerDown: (event: PointerEvent<SVGCircleElement>) => void;
}) {
  return <circle className="symbol-editor__handle" cx={x} cy={y} r={4} onPointerDown={onPointerDown} />;
}
