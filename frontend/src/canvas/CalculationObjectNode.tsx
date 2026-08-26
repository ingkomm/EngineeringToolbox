import { Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect, useLayoutEffect, useState, type KeyboardEvent } from "react";
import type { CalculationObject } from "../types/contract";
import { formatValue, inputHandleId, outputHandleId } from "../lib/display";
import { VARIABLE_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { RowHandle } from "./RowHandle";

export type CalculationObjectNodeType = Node<
  {
    object: CalculationObject;
    mappedInputIds: string[];
    quantities: QuantitySpec[];
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "calculationObject"
>;

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

export function CalculationObjectNode({ id, data }: NodeProps<CalculationObjectNodeType>) {
  const { object, mappedInputIds, quantities, onEdit } = data;
  const mapped = new Set(mappedInputIds);
  const localSources = [...object.inputs, ...object.calculations].map((item) => item.id);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    object.inputs,
    object.calculations,
    object.outputs,
    updateNodeInternals,
  ]);

  return (
    <article className="calc-node" data-testid={`object-${id}`}>
      <header className="calc-node__header">
        <span className="calc-node__kicker">Calculation Object</span>
        <input
          className="calc-node__name nodrag nopan"
          value={object.name}
          data-testid={`object-${id}-name`}
          onChange={(event) => onEdit({ type: "renameObject", objectId: id, name: event.target.value })}
          onKeyDown={stopKeys}
          aria-label="Object name"
        />
        <button
          type="button"
          className="icon-btn nodrag"
          title="객체 삭제"
          data-testid={`object-${id}-delete`}
          onClick={() => onEdit({ type: "deleteObject", objectId: id })}
        >
          ×
        </button>
      </header>

      <section className="calc-table calc-table--input">
        <div className="calc-table__title">
          <span>Input</span>
          <button
            type="button"
            className="link-btn nodrag"
            data-testid={`object-${id}-add-input`}
            onClick={() => onEdit({ type: "addInput", objectId: id })}
          >
            + 변수
          </button>
        </div>
        {object.inputs.length === 0 ? <p className="calc-empty">입력 변수를 추가하세요</p> : null}
        {object.inputs.map((item, index) => {
          const isMapped = mapped.has(item.id);
          return (
            <div
              className="calc-row calc-row--input"
              key={`in-${index}`}
              data-status={item.status ?? "idle"}
              data-testid={`object-${id}-input-row-${item.id}`}
            >
              <RowHandle
                nodeId={id}
                handleId={inputHandleId(item.id)}
                type="target"
                position={Position.Left}
                className="calc-handle calc-handle--in"
              />
              <IdField
                value={item.id}
                testId={`object-${id}-input-${item.id}-id`}
                onCommit={(nextId) => onEdit({ type: "updateInput", objectId: id, index, patch: { id: nextId } })}
              />
              {isMapped ? (
                <span
                  className="calc-row__value calc-row__value--mapped"
                  title={item.error ?? "Mapped input"}
                  data-testid={`object-${id}-input-${item.id}-value`}
                >
                  {formatValue(item.value)}
                </span>
              ) : (
                <ValueField
                  value={item.value}
                  testId={`object-${id}-input-${item.id}-value`}
                  onCommit={(value) => onEdit({ type: "updateInput", objectId: id, index, patch: { value } })}
                  ariaLabel={`${object.name} ${item.id} value`}
                />
              )}
              <QuantityField
                quantities={quantities}
                value={item.quantity ?? null}
                testId={`object-${id}-input-${item.id}-quantity`}
                onChange={(quantity) => onEdit({ type: "updateInput", objectId: id, index, patch: { quantity } })}
              />
              <button
                type="button"
                className="icon-btn nodrag"
                data-testid={`object-${id}-input-${item.id}-remove`}
                onClick={() => onEdit({ type: "removeInput", objectId: id, index })}
              >
                ×
              </button>
            </div>
          );
        })}
      </section>

      <section className="calc-table calc-table--calc">
        <div className="calc-table__title">
          <span>Calculation</span>
          <button
            type="button"
            className="link-btn nodrag"
            data-testid={`object-${id}-add-calc`}
            onClick={() => onEdit({ type: "addCalculation", objectId: id })}
          >
            + 수식
          </button>
        </div>
        {object.calculations.length === 0 ? (
          <p className="calc-empty">수식을 직접 작성하세요. 연산자: + - * / ** % 와 괄호</p>
        ) : null}
        {object.calculations.map((item, index) => (
          <div
            className="calc-row calc-row--calc"
            key={`calc-${index}`}
            data-status={item.status ?? "idle"}
            data-testid={`object-${id}-calc-row-${item.id}`}
          >
            <IdField
              value={item.id}
              testId={`object-${id}-calc-${item.id}-id`}
              onCommit={(nextId) => onEdit({ type: "updateCalculation", objectId: id, index, patch: { id: nextId } })}
            />
            <FormulaField
              value={item.formula}
              testId={`object-${id}-calc-${item.id}-formula`}
              onCommit={(formula) => onEdit({ type: "updateCalculation", objectId: id, index, patch: { formula } })}
              ariaLabel={`${item.id} formula`}
            />
            <span
              className="calc-row__value"
              title={item.error ?? undefined}
              data-testid={`object-${id}-calc-${item.id}-value`}
            >
              {formatValue(item.value)}
            </span>
            <span
              className="calc-row__unit"
              title="Python이 수식에서 유추한 SI 물성"
              data-testid={`object-${id}-calc-${item.id}-quantity`}
            >
              {inferredQuantityLabel(item.quantity, item.unit, quantities)}
            </span>
            <button
              type="button"
              className="icon-btn nodrag"
              data-testid={`object-${id}-calc-${item.id}-remove`}
              onClick={() => onEdit({ type: "removeCalculation", objectId: id, index })}
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="calc-table calc-table--output">
        <div className="calc-table__title">
          <span>Output Port</span>
          <button
            type="button"
            className="link-btn nodrag"
            data-testid={`object-${id}-add-output`}
            disabled={localSources.length === 0}
            onClick={() => onEdit({ type: "addOutput", objectId: id })}
          >
            + 포트
          </button>
        </div>
        {object.outputs.length === 0 ? <p className="calc-empty">다른 객체로 보낼 변수를 포트로 노출하세요</p> : null}
        {object.outputs.map((item, index) => (
          <div
            className="calc-row calc-row--output"
            key={`out-${index}`}
            data-status={item.status ?? "idle"}
            data-testid={`object-${id}-output-row-${item.id}`}
          >
            <select
              className="calc-row__select nodrag nopan nowheel"
              value={item.sourceVariableId}
              data-testid={`object-${id}-output-${item.id}-source`}
              onKeyDown={stopKeys}
              onChange={(event) =>
                onEdit({
                  type: "updateOutput",
                  objectId: id,
                  index,
                  patch: { sourceVariableId: event.target.value, id: event.target.value },
                })
              }
            >
              {localSources.map((sourceId) => (
                <option key={sourceId} value={sourceId}>
                  {sourceId}
                </option>
              ))}
            </select>
            <span className="calc-row__value" data-testid={`object-${id}-output-${item.id}-value`}>
              {formatValue(item.value)}
            </span>
            <span className="calc-row__unit">{item.unit ?? "—"}</span>
            <button
              type="button"
              className="icon-btn nodrag"
              onClick={() => onEdit({ type: "removeOutput", objectId: id, index })}
            >
              ×
            </button>
            <RowHandle
              nodeId={id}
              handleId={outputHandleId(item.id)}
              type="source"
              position={Position.Right}
              className="calc-handle calc-handle--out"
            />
          </div>
        ))}
      </section>
    </article>
  );
}

function ValueField({
  value,
  onCommit,
  ariaLabel,
  testId,
}: {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  ariaLabel: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  return (
    <input
      className="calc-row__input nodrag nopan nowheel"
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder="값"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const raw = draft.trim();
        if (raw === "") {
          onCommit(null);
          return;
        }
        const next = Number(raw);
        if (Number.isNaN(next)) {
          setDraft(value == null ? "" : String(value));
          return;
        }
        onCommit(next);
      }}
    />
  );
}

function FormulaField({
  value,
  onCommit,
  ariaLabel,
  testId,
}: {
  value: string;
  onCommit: (formula: string) => void;
  ariaLabel: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      className="calc-row__formula-input nodrag nopan"
      value={draft}
      placeholder="POUT - PIN"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function IdField({
  value,
  onCommit,
  testId,
}: {
  value: string;
  onCommit: (id: string) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      className="calc-row__id-input nodrag nopan"
      value={draft}
      data-testid={testId}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value.toUpperCase())}
      onBlur={() => {
        if (VARIABLE_ID_RE.test(draft) && draft !== value) onCommit(draft);
        else setDraft(value);
      }}
      aria-label="Variable ID"
    />
  );
}

function inferredQuantityLabel(
  quantity: string | null | undefined,
  unit: string | null | undefined,
  quantities: QuantitySpec[],
): string {
  const spec = quantities.find((item) => item.id === quantity);
  if (spec) return `${spec.nameKo} ${spec.siUnit}`;
  if (unit) return unit;
  return "—";
}

function QuantityField({
  quantities,
  value,
  onChange,
  testId,
}: {
  quantities: QuantitySpec[];
  value: string | null;
  onChange: (quantity: string | null) => void;
  testId: string;
}) {
  return (
    <select
      className="calc-row__qty nodrag nopan nowheel"
      value={value ?? ""}
      data-testid={testId}
      onKeyDown={stopKeys}
      onChange={(event) => onChange(event.target.value || null)}
      title="SI 표준 물성"
    >
      <option value="">물성</option>
      {quantities.map((item) => (
        <option key={item.id} value={item.id}>
          {item.nameKo} {item.siUnit}
        </option>
      ))}
    </select>
  );
}
