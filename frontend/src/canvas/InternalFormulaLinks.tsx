import { useLayoutEffect, useState, type RefObject } from "react";

export interface FormulaLink {
  inputId: string;
  calcId: string;
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

function nubCenter(body: DOMRect, nub: Element): { x: number; y: number } | null {
  const box = nub.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    x: box.left + box.width / 2 - body.left,
    y: box.top + box.height / 2 - body.top,
  };
}

export function InternalFormulaLinks({
  objectId,
  bodyRef,
  links,
  activeCalcId,
}: {
  objectId: string;
  bodyRef: RefObject<HTMLElement | null>;
  links: FormulaLink[];
  activeCalcId: string | null;
}) {
  const [paths, setPaths] = useState<Array<FormulaLink & { d: string }>>([]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;

    const measure = () => {
      const bodyBox = body.getBoundingClientRect();
      const next: Array<FormulaLink & { d: string }> = [];
      for (const link of links) {
        const from = body.querySelector(`[data-formula-nub="input:${link.inputId}"]`);
        const to = body.querySelector(`[data-formula-nub="calc:${link.calcId}"]`);
        if (!from || !to) continue;
        const start = nubCenter(bodyBox, from);
        const end = nubCenter(bodyBox, to);
        if (!start || !end) continue;
        next.push({ ...link, d: elbowPath(start.x, start.y, end.x, end.y) });
      }
      setPaths(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [bodyRef, links]);

  if (paths.length === 0) return null;
  const highlighting = activeCalcId != null;

  return (
    <svg className="formula-links nodrag nopan" aria-hidden data-testid={`object-${objectId}-formula-links`}>
      {paths.map((path) => {
        const active = highlighting && path.calcId === activeCalcId;
        const dimmed = highlighting && !active;
        return (
          <path
            key={`${path.inputId}:${path.calcId}`}
            d={path.d}
            className={[
              "formula-links__path",
              active ? "formula-links__path--active" : "",
              dimmed ? "formula-links__path--dim" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid={`object-${objectId}-formula-link-${path.inputId}-${path.calcId}`}
            data-active={active ? "true" : "false"}
          />
        );
      })}
    </svg>
  );
}
