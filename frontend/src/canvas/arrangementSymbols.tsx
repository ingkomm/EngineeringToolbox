import type { CSSProperties, ReactNode } from "react";

interface SymbolProps {
  title: string;
  selected?: boolean;
}

const svgProps = {
  viewBox: "0 0 96 64",
  preserveAspectRatio: "xMidYMid meet",
  className: "arr-symbol-svg",
};

export function GenericEquipmentSymbol({ title, selected }: SymbolProps) {
  return (
    <svg {...svgProps} aria-label={title}>
      <rect
        x="4"
        y="8"
        width="88"
        height="48"
        rx="10"
        className={`arr-symbol__body ${selected ? "arr-symbol__body--selected" : ""}`}
      />
      <rect x="14" y="18" width="40" height="28" rx="4" className="arr-symbol__inset" />
      <circle cx="70" cy="32" r="10" className="arr-symbol__accent" />
      <path d="M64 32h12" className="arr-symbol__stroke" />
    </svg>
  );
}

export function GenericValveSymbol({ title, selected }: SymbolProps) {
  return (
    <svg viewBox="0 0 96 48" preserveAspectRatio="xMidYMid meet" className="arr-symbol-svg" aria-label={title}>
      <path
        d="M8 24h20L48 8l20 16h20"
        className={`arr-symbol__stroke arr-symbol__stroke--pipe ${selected ? "arr-symbol__body--selected" : ""}`}
      />
      <path d="M48 8v32" className="arr-symbol__stroke" />
      <path d="M32 24 L48 8 L64 24 L48 40 Z" className={`arr-symbol__body ${selected ? "arr-symbol__body--selected" : ""}`} />
    </svg>
  );
}

const SYMBOL_REGISTRY: Record<string, (props: SymbolProps) => ReactNode> = {
  "generic-equipment": GenericEquipmentSymbol,
  "generic-valve": GenericValveSymbol,
};

export function ArrangementSymbol({
  symbolId,
  title,
  selected,
  style,
}: SymbolProps & { symbolId: string; style?: CSSProperties }) {
  const render = SYMBOL_REGISTRY[symbolId] ?? GenericEquipmentSymbol;
  return (
    <div className="arr-symbol" style={style} title={title}>
      {render({ title, selected })}
    </div>
  );
}
