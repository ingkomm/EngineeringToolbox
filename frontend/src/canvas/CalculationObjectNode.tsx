import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";
import type { CalculationObject, MappingEdge } from "../types/contract";
import { formatValue, inputHandleId, outputHandleId } from "../lib/display";

export type CalculationObjectNodeType = Node<
  {
    object: CalculationObject;
    mappedInputIds: string[];
    onInputChange: (objectId: string, variableId: string, raw: string) => void;
  },
  "calculationObject"
>;

const HEADER_H = 46;
const SECTION_PAD_TOP = 8;
const SECTION_LABEL_H = 22;
const ROW_H = 32;

function sectionRowStart(object: CalculationObject, section: "input" | "calculation" | "output"): number {
  let top = HEADER_H;
  const sections: Array<["input" | "calculation" | "output", number]> = [
    ["input", object.inputs.length],
    ["calculation", object.calculations.length],
    ["output", object.outputs.length],
  ];
  for (const [name, count] of sections) {
    top += SECTION_PAD_TOP + SECTION_LABEL_H;
    if (name === section) return top;
    top += count * ROW_H;
  }
  return top;
}

function rowCenter(object: CalculationObject, section: "input" | "calculation" | "output", index: number): number {
  return sectionRowStart(object, section) + index * ROW_H + ROW_H / 2;
}

export function CalculationObjectNode({ id, data }: NodeProps<CalculationObjectNodeType>) {
  const { object, mappedInputIds, onInputChange } = data;
  const mapped = new Set(mappedInputIds);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    object.inputs.length,
    object.calculations.length,
    object.outputs.length,
    updateNodeInternals,
  ]);

  return (
    <article className="calc-node">
      <header className="calc-node__header">
        <span className="calc-node__kicker">Calculation Object</span>
        <h2>{object.name}</h2>
        <span className="calc-node__id">{object.id}</span>
      </header>

      <section className="calc-table calc-table--input">
        <div className="calc-table__title">Input Table</div>
        {object.inputs.map((item, index) => {
          const isMapped = mapped.has(item.id);
          return (
            <div className="calc-row" key={item.id} data-status={item.status ?? "idle"}>
              <Handle
                type="target"
                position={Position.Left}
                id={inputHandleId(item.id)}
                className="calc-handle calc-handle--in"
                style={{ top: rowCenter(object, "input", index) }}
              />
              <span className="calc-row__id">{item.id}</span>
              {isMapped ? (
                <span className="calc-row__value calc-row__value--mapped" title="Mapped from connected output">
                  {formatValue(item.value)}
                </span>
              ) : (
                <input
                  className="calc-row__input nodrag nopan"
                  type="number"
                  step="any"
                  value={item.value ?? ""}
                  onChange={(event) => onInputChange(id, item.id, event.target.value)}
                  aria-label={`${object.name} ${item.id}`}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="calc-table calc-table--calc">
        <div className="calc-table__title">Calculation Table</div>
        {object.calculations.map((item) => (
          <div className="calc-row" key={item.id} data-status={item.status ?? "idle"}>
            <span className="calc-row__id">{item.id}</span>
            <span className="calc-row__formula" title={item.formula}>
              {item.formula}
            </span>
            <span className="calc-row__value">{formatValue(item.value)}</span>
          </div>
        ))}
      </section>

      <section className="calc-table calc-table--output">
        <div className="calc-table__title">Output Table</div>
        {object.outputs.map((item, index) => (
          <div className="calc-row" key={item.id} data-status={item.status ?? "idle"}>
            <span className="calc-row__id">{item.id}</span>
            <span className="calc-row__formula">← {item.sourceVariableId}</span>
            <span className="calc-row__value">{formatValue(item.value)}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={outputHandleId(item.id)}
              className="calc-handle calc-handle--out"
              style={{ top: rowCenter(object, "output", index) }}
            />
          </div>
        ))}
      </section>
    </article>
  );
}

export function mappedInputsForObject(objectId: string, edges: MappingEdge[]): string[] {
  return edges.filter((edge) => edge.targetObjectId === objectId).map((edge) => edge.targetVariableId);
}
