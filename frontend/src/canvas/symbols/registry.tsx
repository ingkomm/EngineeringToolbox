import type { ReactElement } from "react";
import type { EquipmentObject, EquipmentRotation } from "../../types/contract";
import type { LibrarySymbol } from "./library";
import { resolveDrawing } from "./drawing";
import { DrawingSvg } from "./DrawingSvg";

export function renderSystemLibraryTile(kind: "point" | "calculation" | "memo", title?: string): ReactElement {
  if (kind === "point") {
    return (
      <svg viewBox="0 0 44 44" className="pid-symbol-svg" aria-label={title ?? "Point"}>
        <circle cx="22" cy="22" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="22" cy="22" r="2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "memo") {
    return (
      <svg viewBox="0 0 44 44" className="pid-symbol-svg" aria-label={title ?? "Memo"}>
        <rect x="8" y="8" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <line x1="14" y1="16" x2="30" y2="16" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="22" x2="30" y2="22" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="28" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 44 44" className="pid-symbol-svg" aria-label={title ?? "Calculation"}>
      <rect x="6" y="10" width="32" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <line x1="11" y1="18" x2="27" y2="18" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="24" x2="33" y2="24" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="30" x2="22" y2="30" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function renderLibrarySymbol(item: LibrarySymbol, title?: string): ReactElement {
  if (item.kind === "point") {
    return renderSystemLibraryTile("point", title ?? item.name);
  }
  const drawing = resolveDrawing(item.id, item.drawing);
  return <DrawingSvg drawing={drawing} title={title ?? item.name} />;
}

export function normalizeRotation(value: number | undefined): EquipmentRotation {
  const snapped = ((Math.round((value ?? 0) / 90) * 90) % 360 + 360) % 360;
  return snapped as EquipmentRotation;
}

export function equipmentSize(object: Pick<EquipmentObject, "symbolId" | "width" | "height" | "drawing">) {
  const drawing = resolveDrawing(object.symbolId, object.drawing);
  return {
    width: object.width ?? drawing.width,
    height: object.height ?? drawing.height,
  };
}
