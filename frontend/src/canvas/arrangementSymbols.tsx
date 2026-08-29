import type { CSSProperties } from "react";

interface SymbolProps {
  title: string;
  selected?: boolean;
}

export function GenericEquipmentSymbol({ title, selected }: SymbolProps) {
  return (
    <svg viewBox="0 0 96 64" preserveAspectRatio="xMidYMid meet" className="arr-symbol-svg" aria-label={title}>
      <rect
        x="8"
        y="8"
        width="80"
        height="48"
        rx="8"
        className={`arr-symbol__body ${selected ? "arr-symbol__body--selected" : ""}`}
      />
      <rect x="18" y="18" width="36" height="28" rx="3" className="arr-symbol__inset" />
      <circle cx="68" cy="32" r="9" className="arr-symbol__accent" />
    </svg>
  );
}

export function ArrangementSymbol({
  symbolId,
  title,
  selected,
  style,
}: SymbolProps & { symbolId: string; style?: CSSProperties }) {
  void symbolId;
  return (
    <div className="arr-symbol" style={style} title={title}>
      <GenericEquipmentSymbol title={title} selected={selected} />
    </div>
  );
}
