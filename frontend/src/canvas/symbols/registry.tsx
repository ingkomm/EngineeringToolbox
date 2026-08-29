import type { ReactElement } from "react";
import type { EquipmentRotation } from "../../types/contract";

export interface SymbolDef {
  id: string;
  label: string;
  width: number;
  height: number;
  render: (title: string) => ReactElement;
}

function strokeSvg(
  viewBox: string,
  title: string,
  children: JSX.Element,
  className = "pid-symbol-svg",
) {
  return (
    <svg viewBox={viewBox} className={className} aria-label={title} fill="none" stroke="currentColor" strokeWidth="2">
      {children}
    </svg>
  );
}

const generic: SymbolDef = {
  id: "generic-equipment",
  label: "Generic Equipment",
  width: 96,
  height: 64,
  render: (title) =>
    strokeSvg("0 0 96 64", title, (
      <>
        <rect x="10" y="10" width="76" height="44" />
        <line x1="10" y1="32" x2="86" y2="32" />
      </>
    )),
};

const pump: SymbolDef = {
  id: "pump",
  label: "Pump",
  width: 72,
  height: 64,
  render: (title) =>
    strokeSvg("0 0 72 64", title, (
      <>
        <circle cx="36" cy="32" r="20" />
        <polygon points="28,22 50,32 28,42" fill="currentColor" stroke="none" />
        <line x1="6" y1="32" x2="16" y2="32" />
        <line x1="56" y1="32" x2="66" y2="32" />
      </>
    )),
};

const fan: SymbolDef = {
  id: "fan-compressor",
  label: "Fan / Compressor",
  width: 72,
  height: 64,
  render: (title) =>
    strokeSvg("0 0 72 64", title, (
      <>
        <circle cx="36" cy="32" r="20" />
        <path d="M36 16 L42 32 L36 48 L30 32 Z" />
        <path d="M16 32 L36 26 L56 32 L36 38 Z" />
        <line x1="6" y1="32" x2="16" y2="32" />
        <line x1="56" y1="32" x2="66" y2="32" />
      </>
    )),
};

const exchanger: SymbolDef = {
  id: "heat-exchanger",
  label: "Heat Exchanger",
  width: 104,
  height: 56,
  render: (title) =>
    strokeSvg("0 0 104 56", title, (
      <>
        <rect x="12" y="10" width="80" height="36" />
        <path d="M20 18 L32 38 L44 18 L56 38 L68 18 L80 38" />
        <line x1="2" y1="20" x2="12" y2="20" />
        <line x1="2" y1="36" x2="12" y2="36" />
        <line x1="92" y1="20" x2="102" y2="20" />
        <line x1="92" y1="36" x2="102" y2="36" />
      </>
    )),
};

const tank: SymbolDef = {
  id: "tank-vessel",
  label: "Tank / Vessel",
  width: 56,
  height: 88,
  render: (title) =>
    strokeSvg("0 0 56 88", title, (
      <>
        <path d="M12 16 Q12 8 28 8 Q44 8 44 16 L44 72 Q44 80 28 80 Q12 80 12 72 Z" />
        <line x1="12" y1="22" x2="44" y2="22" />
        <line x1="28" y1="80" x2="28" y2="86" />
      </>
    )),
};

const turbine: SymbolDef = {
  id: "turbine",
  label: "Turbine",
  width: 88,
  height: 64,
  render: (title) =>
    strokeSvg("0 0 88 64", title, (
      <>
        <polygon points="16,16 48,16 72,32 48,48 16,48" />
        <circle cx="36" cy="32" r="8" />
        <line x1="4" y1="32" x2="16" y2="32" />
        <line x1="72" y1="32" x2="84" y2="32" />
      </>
    )),
};

const valve: SymbolDef = {
  id: "valve",
  label: "Valve",
  width: 56,
  height: 40,
  render: (title) =>
    strokeSvg("0 0 56 40", title, (
      <>
        <polygon points="8,8 28,20 8,32" />
        <polygon points="48,8 28,20 48,32" />
        <line x1="28" y1="20" x2="28" y2="6" />
        <line x1="22" y1="6" x2="34" y2="6" />
      </>
    )),
};

export const SYMBOL_REGISTRY: SymbolDef[] = [generic, pump, fan, exchanger, tank, turbine, valve];

const BY_ID = new Map(SYMBOL_REGISTRY.map((item) => [item.id, item]));

export function resolveSymbol(symbolId: string | undefined): SymbolDef {
  return BY_ID.get(symbolId ?? "") ?? generic;
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
