import type { ReactElement, ReactNode } from "react";
import type { EquipmentRotation } from "../../types/contract";
import { SYMBOL_CATALOG, type SymbolCatalogEntry } from "./catalog";

export interface SymbolDef extends SymbolCatalogEntry {
  render: (title: string) => ReactElement;
}

function isoSvg(width: number, height: number, title: string, children: ReactNode) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pid-symbol-svg"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  );
}

/** ISO 14617-style originals on a mid-height flow axis. Not scanned from ISO 14084-2. */
const RENDERS: Record<string, (title: string, w: number, h: number) => ReactElement> = {
  valve: (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`8,${cy - 14} ${cx},${cy} 8,${cy + 14}`} />
        <polygon points={`${w - 8},${cy - 14} ${cx},${cy} ${w - 8},${cy + 14}`} />
        <line x1={cx} y1={cy} x2={cx} y2={8} />
        <line x1={cx - 8} y1={8} x2={cx + 8} y2={8} />
      </>
    ));
  },
  "check-valve": (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`8,${cy - 14} ${cx},${cy} 8,${cy + 14}`} />
        <polygon points={`${w - 8},${cy - 14} ${cx},${cy} ${w - 8},${cy + 14}`} />
        <line x1={cx + 4} y1={cy - 12} x2={cx + 4} y2={cy + 12} />
        <polyline points={`${cx - 2},${cy - 6} ${cx + 10},${cy} ${cx - 2},${cy + 6}`} />
      </>
    ));
  },
  "control-valve": (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`8,${cy - 12} ${cx},${cy} 8,${cy + 12}`} />
        <polygon points={`${w - 8},${cy - 12} ${cx},${cy} ${w - 8},${cy + 12}`} />
        <line x1={cx} y1={cy} x2={cx} y2={14} />
        <circle cx={cx} cy={10} r="7" />
        <line x1={cx - 4} y1={10} x2={cx + 4} y2={10} />
      </>
    ));
  },
  "safety-valve": (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`${cx - 14},${cy + 12} ${cx},${cy} ${cx + 14},${cy + 12}`} />
        <polygon points={`${cx - 14},${cy - 12} ${cx},${cy} ${cx + 14},${cy - 12}`} />
        <line x1={cx} y1={cy - 12} x2={cx} y2={12} />
        <path d={`M${cx - 6} 16 C${cx - 6} 8, ${cx + 6} 8, ${cx + 6} 16`} />
        <line x1={cx - 8} y1={8} x2={cx + 8} y2={8} />
      </>
    ));
  },
  damper: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="14" y={cy - 14} width={w - 28} height="28" />
        <line x1="20" y1={cy + 10} x2={w - 20} y2={cy - 10} />
        <line x1={w / 2} y1={cy - 14} x2={w / 2} y2={8} />
        <line x1={w / 2 - 7} y1={8} x2={w / 2 + 7} y2={8} />
      </>
    ));
  },
  pump: (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="20" />
        <polygon points={`${cx - 8},${cy - 10} ${cx + 14},${cy} ${cx - 8},${cy + 10}`} fill="currentColor" stroke="none" />
      </>
    ));
  },
  "fan-compressor": (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="20" />
        <path d={`M${cx} ${cy - 16} Q${cx + 10} ${cy - 4} ${cx} ${cy} Q${cx - 10} ${cy - 4} ${cx} ${cy - 16}`} />
        <path d={`M${cx} ${cy + 16} Q${cx - 10} ${cy + 4} ${cx} ${cy} Q${cx + 10} ${cy + 4} ${cx} ${cy + 16}`} />
        <path d={`M${cx - 16} ${cy} Q${cx - 4} ${cy - 10} ${cx} ${cy} Q${cx - 4} ${cy + 10} ${cx - 16} ${cy}`} />
        <path d={`M${cx + 16} ${cy} Q${cx + 4} ${cy + 10} ${cx} ${cy} Q${cx + 4} ${cy - 10} ${cx + 16} ${cy}`} />
      </>
    ));
  },
  "vacuum-pump": (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="20" />
        <path d={`M${cx - 8} ${cy - 10} L${cx} ${cy + 12} L${cx + 8} ${cy - 10}`} />
        <line x1={cx - 10} y1={cy + 4} x2={cx + 10} y2={cy + 4} />
      </>
    ));
  },
  "heat-exchanger": (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="12" y="8" width={w - 24} height={h - 16} />
        <path d={`M20 ${cy - 10} L32 ${cy + 10} L44 ${cy - 10} L56 ${cy + 10} L68 ${cy - 10} L80 ${cy + 10}`} />
      </>
    ));
  },
  condenser: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="12" y="8" width={w - 24} height={h - 16} />
        <line x1="20" y1={cy - 8} x2={w - 20} y2={cy - 8} />
        <line x1="20" y1={cy} x2={w - 20} y2={cy} />
        <line x1="20" y1={cy + 8} x2={w - 20} y2={cy + 8} />
        <path d={`M${w / 2 - 6} ${h - 6} q3 6 6 0`} />
        <path d={`M${w / 2 + 4} ${h - 6} q3 6 6 0`} />
      </>
    ));
  },
  cooler: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="16" y="10" width={w - 32} height={h - 20} />
        <line x1="10" y1="14" x2="10" y2={h - 14} />
        <line x1="14" y1="14" x2="14" y2={h - 14} />
        <line x1={w - 10} y1="14" x2={w - 10} y2={h - 14} />
        <line x1={w - 14} y1="14" x2={w - 14} y2={h - 14} />
        <line x1="22" y1={cy} x2={w - 22} y2={cy} />
      </>
    ));
  },
  "cooling-tower": (title, w, h) =>
    isoSvg(w, h, title, (
      <>
        <path d={`M16 ${h - 8} L24 28 Q${w / 2} 8 ${w - 24} 28 L${w - 16} ${h - 8} Z`} />
        <line x1="20" y1={h - 8} x2={w - 20} y2={h - 8} />
        <line x1="28" y1="36" x2={w - 28} y2="36" />
      </>
    )),
  filter: (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="16" y="10" width={w - 32} height={h - 20} />
        <line x1="22" y1={cy - 10} x2={w - 22} y2={cy + 10} />
        <line x1="22" y1={cy + 10} x2={w - 22} y2={cy - 10} />
        <line x1={cx} y1="16" x2={cx} y2={h - 16} />
      </>
    ));
  },
  separator: (title, w, h) => {
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <path d={`M12 18 Q12 8 ${cx} 8 Q${w - 12} 8 ${w - 12} 18 L${w - 12} ${h - 18} Q${w - 12} ${h - 8} ${cx} ${h - 8} Q12 ${h - 8} 12 ${h - 18} Z`} />
        <line x1="16" y1="28" x2={w - 16} y2="28" />
        <line x1="20" y1="24" x2={w - 20} y2="24" />
        <line x1={cx} y1={h - 8} x2={cx} y2={h - 2} />
      </>
    ));
  },
  mixer: (title, w, h) => {
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <path d={`M14 20 Q14 10 ${cx} 10 Q${w - 14} 10 ${w - 14} 20 L${w - 14} ${h - 14} Q${w - 14} ${h - 6} ${cx} ${h - 6} Q14 ${h - 6} 14 ${h - 14} Z`} />
        <line x1={cx} y1="10" x2={cx} y2={h - 20} />
        <line x1={cx - 12} y1={h - 24} x2={cx + 12} y2={h - 24} />
        <line x1={cx - 8} y1={h - 30} x2={cx + 8} y2={h - 18} />
      </>
    ));
  },
  "tank-vessel": (title, w, h) => {
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <path d={`M12 16 Q12 8 ${cx} 8 Q${w - 12} 8 ${w - 12} 16 L${w - 12} ${h - 16} Q${w - 12} ${h - 8} ${cx} ${h - 8} Q12 ${h - 8} 12 ${h - 16} Z`} />
        <line x1="12" y1="22" x2={w - 12} y2="22" />
      </>
    ));
  },
  drum: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <path d={`M20 10 Q8 10 8 ${cy} Q8 ${h - 10} 20 ${h - 10} L${w - 20} ${h - 10} Q${w - 8} ${h - 10} ${w - 8} ${cy} Q${w - 8} 10 ${w - 20} 10 Z`} />
      </>
    ));
  },
  accumulator: (title, w, h) => {
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <path d={`M12 16 Q12 8 ${cx} 8 Q${w - 12} 8 ${w - 12} 16 L${w - 12} ${h - 16} Q${w - 12} ${h - 8} ${cx} ${h - 8} Q12 ${h - 8} 12 ${h - 16} Z`} />
        <path d={`M16 28 Q${cx} 40 ${w - 16} 28`} />
        <path d={`M16 ${h - 22} Q${cx} ${h - 34} ${w - 16} ${h - 22}`} />
      </>
    ));
  },
  boiler: (title, w, h) =>
    isoSvg(w, h, title, (
      <>
        <rect x="10" y="8" width={w - 20} height={h - 16} />
        <path d={`M22 ${h - 22} q8 -16 16 0 q8 -16 16 0 q8 -16 16 0`} />
        <line x1="18" y1="20" x2={w - 18} y2="20" />
        <line x1="18" y1="28" x2={w - 18} y2="28" />
      </>
    )),
  furnace: (title, w, h) =>
    isoSvg(w, h, title, (
      <>
        <rect x="12" y="10" width={w - 24} height={h - 20} />
        <path d={`M${w / 2 - 10} ${h - 22} q10 -22 20 0`} />
        <path d={`M${w / 2 - 4} ${h - 22} q6 -14 12 0`} />
      </>
    )),
  turbine: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`14,${cy - 16} 50,${cy - 16} ${w - 12},${cy} 50,${cy + 16} 14,${cy + 16}`} />
        <circle cx="36" cy={cy} r="7" />
      </>
    ));
  },
  "gas-turbine": (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`10,${cy - 10} 40,${cy - 16} 40,${cy + 16} 10,${cy + 10}`} />
        <rect x="40" y={cy - 8} width="16" height="16" />
        <polygon points={`56,${cy - 16} ${w - 10},${cy - 10} ${w - 10},${cy + 10} 56,${cy + 16}`} />
      </>
    ));
  },
  motor: (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="20" />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="currentColor" stroke="none" fontSize="16" fontFamily="IBM Plex Sans, sans-serif">
          M
        </text>
      </>
    ));
  },
  generator: (title, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="20" />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="currentColor" stroke="none" fontSize="16" fontFamily="IBM Plex Sans, sans-serif">
          G
        </text>
      </>
    ));
  },
  strainer: (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <circle cx={cx} cy={cy} r="16" />
        <line x1={cx - 10} y1={cy - 10} x2={cx + 10} y2={cy + 10} />
        <line x1={cx + 8} y1={cy + 8} x2={cx + 8} y2={h - 8} />
        <line x1={cx + 2} y1={h - 8} x2={cx + 14} y2={h - 8} />
      </>
    ));
  },
  orifice: (title, w, h) => {
    const cy = h / 2;
    const cx = w / 2;
    return isoSvg(w, h, title, (
      <>
        <line x1={cx - 6} y1={8} x2={cx - 6} y2={h - 8} />
        <line x1={cx + 6} y1={8} x2={cx + 6} y2={h - 8} />
        <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} />
      </>
    ));
  },
  reducer: (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <polygon points={`10,${cy - 12} 38,${cy - 12} 62,${cy - 6} ${w - 10},${cy - 6} ${w - 10},${cy + 6} 62,${cy + 6} 38,${cy + 12} 10,${cy + 12}`} />
      </>
    ));
  },
  "generic-equipment": (title, w, h) => {
    const cy = h / 2;
    return isoSvg(w, h, title, (
      <>
        <rect x="10" y="10" width={w - 20} height={h - 20} />
        <line x1="10" y1={cy} x2={w - 10} y2={cy} />
      </>
    ));
  },
};

function toDef(entry: SymbolCatalogEntry): SymbolDef {
  const render = RENDERS[entry.id] ?? RENDERS["generic-equipment"]!;
  return {
    ...entry,
    render: (title) => render(title, entry.width, entry.height),
  };
}

export const SYMBOL_REGISTRY: SymbolDef[] = SYMBOL_CATALOG.map(toDef);

const BY_ID = new Map(SYMBOL_REGISTRY.map((item) => [item.id, item]));

export function resolveSymbol(symbolId: string | undefined): SymbolDef {
  return BY_ID.get(symbolId ?? "") ?? BY_ID.get("generic-equipment")!;
}

export function normalizeRotation(value: number | undefined): EquipmentRotation {
  const snapped = ((Math.round((value ?? 0) / 90) * 90) % 360 + 360) % 360;
  return snapped as EquipmentRotation;
}

export function equipmentSize(object: { symbolId: string; width?: number; height?: number }) {
  const symbol = resolveSymbol(object.symbolId);
  return {
    width: object.width ?? symbol.width,
    height: object.height ?? symbol.height,
  };
}

export { SYMBOL_GROUPS, symbolPortDefaults, catalogEntry } from "./catalog";
