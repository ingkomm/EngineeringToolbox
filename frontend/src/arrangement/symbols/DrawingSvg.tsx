import type { SymbolDrawing, SymbolPrimitive } from "./drawing";

export function DrawingSvg({
  drawing,
  title,
  selectedId,
  className = "pid-symbol-svg",
}: {
  drawing: SymbolDrawing;
  title?: string;
  selectedId?: string | null;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      className={className}
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <DrawingPrimitives drawing={drawing} selectedId={selectedId} />
    </svg>
  );
}

export function DrawingPrimitives({
  drawing,
  selectedId,
}: {
  drawing: SymbolDrawing;
  selectedId?: string | null;
}) {
  return (
    <>
      {drawing.primitives.map((item) => (
        <PrimitiveShape key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </>
  );
}

function PrimitiveShape({ item, selected }: { item: SymbolPrimitive; selected: boolean }) {
  const stroke = selected ? "#6cb6ff" : "currentColor";
  if (item.kind === "line") {
    return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={stroke} />;
  }
  if (item.kind === "circle") {
    return <circle cx={item.cx} cy={item.cy} r={item.r} stroke={stroke} />;
  }
  return <polygon points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} stroke={stroke} />;
}
