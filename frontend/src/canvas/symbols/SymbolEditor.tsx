import { useMemo, useState, type MouseEvent } from "react";
import type { SymbolDrawing, SymbolPrimitive } from "./drawing";
import { defaultDrawing, nextPrimitiveId } from "./drawing";
import { CANVAS_GRID, snapToGrid } from "./grid";
import { DrawingPrimitives } from "./DrawingSvg";

type Tool = "select" | "line" | "circle" | "polygon";

export function SymbolEditor({
  symbolId,
  drawing,
  onChange,
  onClose,
}: {
  symbolId: string;
  drawing: SymbolDrawing;
  onChange: (drawing: SymbolDrawing) => void;
  onClose: () => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SymbolDrawing>(drawing);
  const [pending, setPending] = useState<Array<{ x: number; y: number }>>([]);

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

  const pointFromEvent = (event: MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const box = svg.getBoundingClientRect();
    const x = snapToGrid(((event.clientX - box.left) / box.width) * draft.width);
    const y = snapToGrid(((event.clientY - box.top) / box.height) * draft.height);
    return { x, y };
  };

  const commit = (next: SymbolDrawing) => {
    setDraft(next);
    onChange(next);
  };

  const addPrimitive = (item: SymbolPrimitive) => {
    commit({ ...draft, primitives: [...draft.primitives, item] });
    setPending([]);
    setSelectedId(item.id);
    setTool("select");
  };

  const onSvgClick = (event: MouseEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "line") {
      if (pending.length === 0) {
        setPending([point]);
        return;
      }
      addPrimitive({
        id: nextPrimitiveId(draft, "line"),
        kind: "line",
        x1: pending[0]!.x,
        y1: pending[0]!.y,
        x2: point.x,
        y2: point.y,
      });
      return;
    }
    if (tool === "circle") {
      if (pending.length === 0) {
        setPending([point]);
        return;
      }
      const dx = point.x - pending[0]!.x;
      const dy = point.y - pending[0]!.y;
      const r = Math.max(CANVAS_GRID, snapToGrid(Math.hypot(dx, dy)));
      addPrimitive({
        id: nextPrimitiveId(draft, "circle"),
        kind: "circle",
        cx: pending[0]!.x,
        cy: pending[0]!.y,
        r,
      });
      return;
    }
    if (pending.length >= 2 && point.x === pending[0]!.x && point.y === pending[0]!.y) {
      addPrimitive({
        id: nextPrimitiveId(draft, "poly"),
        kind: "polygon",
        points: pending,
      });
      return;
    }
    setPending([...pending, point]);
  };

  const onPrimitiveClick = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    if (tool !== "select") return;
    setSelectedId(id);
  };

  const closePolygon = () => {
    if (tool !== "polygon" || pending.length < 3) return;
    addPrimitive({
      id: nextPrimitiveId(draft, "poly"),
      kind: "polygon",
      points: pending,
    });
  };

  const removeSelected = () => {
    if (!selectedId) return;
    commit({ ...draft, primitives: draft.primitives.filter((item) => item.id !== selectedId) });
    setSelectedId(null);
  };

  return (
    <div className="symbol-editor nodrag nopan" data-testid="symbol-editor" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <strong>심볼 편집</strong>
        <span>직선 · 원 · 다각형 · 그리드 {CANVAS_GRID}px</span>
        <button type="button" className="icon-btn" onClick={onClose}>
          ×
        </button>
      </header>
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
            }}
          >
            {item === "select" ? "선택" : item === "line" ? "직선" : item === "circle" ? "원" : "다각형"}
          </button>
        ))}
        <button type="button" className="ghost-btn" disabled={tool !== "polygon" || pending.length < 3} onClick={closePolygon}>
          다각형 닫기
        </button>
        <button type="button" className="ghost-btn" disabled={!selectedId} onClick={removeSelected}>
          삭제
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            const next = defaultDrawing(symbolId);
            setDraft(next);
            onChange(next);
            setSelectedId(null);
            setPending([]);
          }}
        >
          기본값
        </button>
      </div>
      <svg
        className="symbol-editor__canvas"
        viewBox={`0 0 ${draft.width} ${draft.height}`}
        data-testid="symbol-editor-canvas"
        onClick={onSvgClick}
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
          <g key={`hit-${item.id}`} onClick={(event) => onPrimitiveClick(event, item.id)} className="symbol-editor__hit">
            <HitShape item={item} />
          </g>
        ))}
        {pending.map((point, index) => (
          <circle key={`p${index}`} className="symbol-editor__pending" cx={point.x} cy={point.y} r={2} />
        ))}
      </svg>
      <p className="symbol-editor__hint">
        직선/원: 두 점 클릭. 다각형: 꼭짓점 클릭 후 닫기. 중심선은 가로·세로 점선입니다.
      </p>
    </div>
  );
}

function HitShape({ item }: { item: SymbolPrimitive }) {
  if (item.kind === "line") {
    return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth="8" />;
  }
  if (item.kind === "circle") {
    return <circle cx={item.cx} cy={item.cy} r={item.r} fill="transparent" stroke="transparent" strokeWidth="8" />;
  }
  return <polygon points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="transparent" stroke="transparent" strokeWidth="8" />;
}
