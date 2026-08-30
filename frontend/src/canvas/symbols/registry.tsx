import type { ReactElement } from "react";
import type { EquipmentObject, EquipmentRotation } from "../../types/contract";
import type { LibrarySymbol } from "./library";
import { resolveDrawing } from "./drawing";
import { DrawingSvg } from "./DrawingSvg";
import { evenGridSize } from "./grid";

export function renderLibrarySymbol(item: LibrarySymbol, title?: string): ReactElement {
  if (item.kind === "point") {
    return (
      <svg viewBox="0 0 44 44" className="pid-symbol-svg" aria-label={title ?? item.name}>
        <circle cx="22" cy="22" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="22" cy="22" r="2" fill="currentColor" stroke="none" />
      </svg>
    );
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
    width: evenGridSize(object.width ?? drawing.width),
    height: evenGridSize(object.height ?? drawing.height),
  };
}
