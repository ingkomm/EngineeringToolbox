import { Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CalculationObject, ProjectDocument } from "../types/contract";
import { formatValue, inputHandleId, outputHandleId } from "../lib/display";
import { ObjectLinkHandle } from "./ObjectLinkHandle";
import {
  applyCandidate,
  identifierAt,
  matchingCandidates,
  shouldShowCallout,
  FORMULA_FUNCTIONS,
  type FormulaCandidate,
} from "../lib/formulaComplete";
import { OBJECT_ID_RE, VARIABLE_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { OBJECT_LINK_HANDLE, objectLinkSideOf } from "../lib/worksheet";
import { displayName } from "../lib/variables";
import type { QuantitySpec } from "../lib/quantities";
import { RowHandle } from "./RowHandle";
import { PortSearch } from "./PortSearch";

export type CalculationObjectNodeType = Node<
  {
    object: CalculationObject;
    project: ProjectDocument;
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
  const { object, project, mappedInputIds, quantities, onEdit } = data;
  const mapped = new Set(mappedInputIds);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = [
    ...object.inputs.map((item) => item.id),
    ...object.outputs.map((item) => item.id),
    OBJECT_LINK_HANDLE,
    objectLinkSideOf(object),
  ].join("|");

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  const candidatesFor = (excludeId: string): FormulaCandidate[] => [
    ...[...object.inputs, ...object.calculations]
      .filter((item) => item.id !== excludeId)
      .map((item) => ({
        id: item.id,
        hint: `${displayName(item)}${quantityHint(item.quantity, item.unit, quantities) ? ` · ${quantityHint(item.quantity, item.unit, quantities)}` : ""}`,
      })),
    ...FORMULA_FUNCTIONS,
  ];

  return (
    <article className="calc-node" data-testid={`object-${id}`}>
      <ObjectLinkHandle
        nodeId={id}
        side={objectLinkSideOf(object)}
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: objectLinkSideOf(object) === "top" ? "bottom" : "top",
          })
        }
      />
      <header className="calc-node__header">
        <span className="calc-node__kicker">Calculation Object</span>
        <ObjectIdField
          value={object.id}
          testId={`object-${id}-id`}
          onCommit={(nextId) => onEdit({ type: "updateObject", objectId: id, patch: { id: nextId } })}
        />
        <NameField
          value={object.name}
          testId={`object-${id}-name`}
          onCommit={(name) => onEdit({ type: "updateObject", objectId: id, patch: { name } })}
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
          const inbound = project.edges.find(
            (edge) => edge.targetObjectId === id && edge.targetVariableId === item.id,
          );
          return (
            <div
              className="calc-row calc-row--input"
              key={item.id}
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
              <div className="port-tools">
                <PortSearch
                  project={project}
                  selfObjectId={id}
                  selfVariableId={item.id}
                  direction="from-output"
                  testId={`object-${id}-input-${item.id}-search`}
                  onPick={(hit) =>
                    onEdit({
                      type: "connectBySearch",
                      sourceObjectId: hit.objectId,
                      sourceVariableId: hit.variableId,
                      targetObjectId: id,
                      targetVariableId: item.id,
                      relationType: hit.relationType,
                    })
                  }
                  onDisconnect={(hit) => {
                    if (hit.edgeId) onEdit({ type: "deleteEdges", edgeIds: [hit.edgeId] });
                  }}
                />
                {inbound ? (
                  <LinkCollapseButton
                    edgeId={inbound.id}
                    collapsed={inbound.collapsed === true}
                    onEdit={onEdit}
                    testId={`object-${id}-input-${item.id}-link`}
                  />
                ) : null}
              </div>
              {isMapped ? (
                <span className="calc-row__id-input calc-row__id-input--mapped" data-testid={`object-${id}-input-${item.id}-id`}>
                  {item.id}
                </span>
              ) : (
                <IdField
                  value={item.id}
                  testId={`object-${id}-input-${item.id}-id`}
                  onCommit={(nextId) => onEdit({ type: "updateInput", objectId: id, index, patch: { id: nextId } })}
                />
              )}
              {isMapped ? (
                <span className="calc-row__name calc-row__name--mapped" data-testid={`object-${id}-input-${item.id}-name`}>
                  {displayName(item)}
                </span>
              ) : (
                <NameField
                  value={displayName(item)}
                  testId={`object-${id}-input-${item.id}-name`}
                  onCommit={(name) => onEdit({ type: "updateInput", objectId: id, index, patch: { name } })}
                />
              )}
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
                disabled={isMapped}
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
          <p className="calc-empty">수식: + - * / ^ % 와 괄호, LOG LN EXP ROUND POWER SQRT ABS</p>
        ) : null}
        {object.calculations.map((item, index) => (
          <div
            className="calc-row calc-row--calc"
            key={item.id}
            data-status={item.status ?? "idle"}
            data-testid={`object-${id}-calc-row-${item.id}`}
          >
            <IdField
              value={item.id}
              testId={`object-${id}-calc-${item.id}-id`}
              onCommit={(nextId) => onEdit({ type: "updateCalculation", objectId: id, index, patch: { id: nextId } })}
            />
            <NameField
              value={displayName(item)}
              testId={`object-${id}-calc-${item.id}-name`}
              onCommit={(name) => onEdit({ type: "updateCalculation", objectId: id, index, patch: { name } })}
            />
            <FormulaField
              value={item.formula}
              testId={`object-${id}-calc-${item.id}-formula`}
              candidates={candidatesFor(item.id)}
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
              title={item.error ?? "Python이 수식에서 유추한 SI 물성"}
              data-testid={`object-${id}-calc-${item.id}-quantity`}
            >
              {item.status === "error" ? "오류" : inferredQuantityLabel(item.quantity, item.unit, quantities)}
            </span>
            <button
              type="button"
              className="icon-btn nodrag"
              data-testid={`object-${id}-calc-${item.id}-remove`}
              onClick={() => onEdit({ type: "removeCalculation", objectId: id, index })}
            >
              ×
            </button>
            {item.error ? (
              <p className="calc-row__error" data-testid={`object-${id}-calc-${item.id}-error`}>
                {item.error}
              </p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="calc-table calc-table--output">
        <div className="calc-table__title">
          <span>Output Port · 자동 연동</span>
        </div>
        {object.outputs.length === 0 ? (
          <p className="calc-empty">Input/Calculation 변수가 생기면 오른쪽으로 자동 노출됩니다</p>
        ) : null}
        {object.outputs.map((item) => {
          const outbound = project.edges.filter(
            (edge) => edge.sourceObjectId === id && edge.sourceVariableId === item.id,
          );
          return (
            <div
              className="calc-row calc-row--output"
              key={item.id}
              data-status={item.status ?? "idle"}
              data-testid={`object-${id}-output-row-${item.id}`}
            >
            <span className="calc-row__port-id" data-testid={`object-${id}-output-${item.id}-source`}>
              {item.sourceVariableId}
              {item.name && item.name !== item.id ? ` · ${item.name}` : ""}
            </span>
            <span className="calc-row__value" data-testid={`object-${id}-output-${item.id}-value`}>
              {formatValue(item.value)}
            </span>
            <span className="calc-row__unit">{item.unit ?? "—"}</span>
            <div className="port-tools">
              <PortSearch
                project={project}
                selfObjectId={id}
                selfVariableId={item.id}
                direction="to-input"
                testId={`object-${id}-output-${item.id}-search`}
                onPick={(hit) =>
                  onEdit({
                    type: "connectBySearch",
                    sourceObjectId: id,
                    sourceVariableId: item.id,
                    targetObjectId: hit.objectId,
                    targetVariableId: hit.createInput ? undefined : hit.variableId,
                    relationType: hit.relationType,
                  })
                }
                onDisconnect={(hit) => {
                  if (hit.edgeId) onEdit({ type: "deleteEdges", edgeIds: [hit.edgeId] });
                }}
              />
              {outbound[0] ? (
                <LinkCollapseButton
                  edgeId={outbound[0].id}
                  collapsed={outbound[0].collapsed === true}
                  onEdit={onEdit}
                  testId={`object-${id}-output-${item.id}-link`}
                />
              ) : null}
            </div>
            <RowHandle
              nodeId={id}
              handleId={outputHandleId(item.id)}
              type="source"
              position={Position.Right}
              className="calc-handle calc-handle--out"
            />
          </div>
          );
        })}
      </section>

      <section className="calc-table calc-table--link">
        <div className="calc-table__title">
          <span>Link</span>
          <button
            type="button"
            className="link-btn nodrag"
            data-testid={`object-${id}-add-link`}
            onClick={() => onEdit({ type: "addLink", objectId: id })}
          >
            + 링크
          </button>
        </div>
        {(object.links ?? []).length === 0 ? (
          <p className="calc-empty">노란 점으로 Point / Equipment와 점선 연결합니다</p>
        ) : null}
        {(object.links ?? []).map((item, index) => {
          return (
            <div className="calc-row calc-row--link" key={item.id} data-testid={`object-${id}-link-row-${item.id}`}>
              <input
                className="calc-node__id nodrag"
                defaultValue={item.id}
                data-testid={`object-${id}-link-${item.id}-id`}
                onKeyDown={stopKeys}
                onBlur={(event) => {
                  const nextId = event.target.value.trim();
                  if (!VARIABLE_ID_RE.test(nextId) || nextId === item.id) {
                    event.target.value = item.id;
                    return;
                  }
                  onEdit({ type: "updateLink", objectId: id, index, patch: { id: nextId } });
                }}
              />
              <span className="calc-row__target" data-testid={`object-${id}-link-${item.id}-target`}>
                {item.targetObjectId ?? "—"}
              </span>
              <div className="port-tools">
                <PortSearch
                  project={project}
                  selfObjectId={id}
                  selfVariableId={item.id}
                  direction="to-layout"
                  testId={`object-${id}-link-${item.id}-search`}
                  onPick={(hit) =>
                    onEdit({
                      type: "connectLink",
                      objectId: id,
                      linkId: item.id,
                      targetObjectId: hit.objectId,
                      targetPortId: OBJECT_LINK_HANDLE,
                    })
                  }
                  onDisconnect={(hit) => {
                    if (hit.edgeId) onEdit({ type: "deleteEdges", edgeIds: [hit.edgeId] });
                    else onEdit({ type: "connectLink", objectId: id, linkId: item.id, targetObjectId: null });
                  }}
                />
                <button
                  type="button"
                  className="icon-btn nodrag"
                  title="링크 삭제"
                  data-testid={`object-${id}-link-${item.id}-delete`}
                  onClick={() => onEdit({ type: "removeLink", objectId: id, index })}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
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
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value == null ? "" : String(value));
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
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focusedRef.current = false;
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
  candidates,
}: {
  value: string;
  onCommit: (formula: string) => void;
  ariaLabel: string;
  testId: string;
  candidates: FormulaCandidate[];
}) {
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(value.length);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      setCursor(value.length);
    }
  }, [focused, value]);

  const token = identifierAt(draft, cursor);
  const matches = useMemo(
    () => matchingCandidates(token?.prefix ?? "", candidates),
    [candidates, token?.prefix],
  );
  const show = focused && token !== null && shouldShowCallout(token.prefix, matches);
  const visible = show ? matches : [];

  useEffect(() => {
    setActive(0);
  }, [token?.prefix]);

  const apply = (id: string) => {
    if (!token) return;
    const next = applyCandidate(draft, token, id);
    setDraft(next.text);
    setCursor(next.cursor);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  return (
    <div className="formula-complete">
      <input
        ref={inputRef}
        className="calc-row__formula-input nodrag nopan nowheel"
        value={draft}
        placeholder="POUT - PIN"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={visible.length > 0}
        data-testid={testId}
        onFocus={(event) => {
          setFocused(true);
          setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
        }}
        onKeyDown={(event) => {
          stopKeys(event);
          if (visible.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % visible.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + visible.length) % visible.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const chosen = visible[active] ?? visible[0];
              if (chosen) apply(chosen.insert ?? chosen.id);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setFocused(false);
              event.currentTarget.blur();
              return;
            }
          }
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setCursor(event.target.selectionStart ?? event.target.value.length);
        }}
        onSelect={(event) => {
          setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
        }}
        onBlur={() => {
          setFocused(false);
          if (draft !== value) onCommit(draft);
        }}
      />
      {visible.length > 0 ? (
        <ul className="formula-complete__list nodrag nopan nowheel" data-testid={`${testId}-complete`} role="listbox">
          {visible.map((item, index) => (
            <li key={`${item.insert ?? "id"}:${item.id}`}>
              <button
                type="button"
                className="formula-complete__item"
                data-active={index === active}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => apply(item.insert ?? item.id)}
              >
                <span>{item.id}</span>
                {item.hint ? <span className="formula-complete__hint">{item.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NameField({
  value,
  onCommit,
  testId,
}: {
  value: string;
  onCommit: (name: string) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      className="calc-row__name-input nodrag nopan"
      value={draft}
      data-testid={testId}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        const next = draft.trim();
        if (next && next !== value) onCommit(next);
        else setDraft(value);
      }}
      aria-label="Variable name"
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
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      className="calc-row__id-input nodrag nopan"
      value={draft}
      data-testid={testId}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value.toUpperCase())}
      onBlur={() => {
        focusedRef.current = false;
        if (VARIABLE_ID_RE.test(draft) && draft !== value) onCommit(draft);
        else setDraft(value);
      }}
      aria-label="Variable ID"
    />
  );
}

function LinkCollapseButton({
  edgeId,
  collapsed,
  onEdit,
  testId,
}: {
  edgeId: string;
  collapsed: boolean;
  onEdit: (edit: WorkspaceEdit) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={`port-link-btn nodrag ${collapsed ? "port-link-btn--on" : ""}`}
      data-testid={testId}
      title={collapsed ? "전체 링크로 펼치기" : "무선 링크로 접기"}
      onClick={() => onEdit({ type: "toggleEdgeCollapsed", edgeId })}
    >
      링크
    </button>
  );
}

function ObjectIdField({
  value,
  onCommit,
  testId,
}: {
  value: string;
  onCommit: (id: string) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      className="calc-node__id nodrag nopan"
      value={draft}
      data-testid={testId}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={(event) => {
        stopKeys(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        if (OBJECT_ID_RE.test(draft) && draft !== value) onCommit(draft);
        else setDraft(value);
      }}
      aria-label="Object ID"
    />
  );
}

function quantityHint(
  quantity: string | null | undefined,
  unit: string | null | undefined,
  quantities: QuantitySpec[],
): string | undefined {
  const spec = quantities.find((item) => item.id === quantity);
  if (spec) return `${spec.nameKo} ${spec.siUnit}`;
  if (unit) return unit;
  return undefined;
}

function inferredQuantityLabel(
  quantity: string | null | undefined,
  unit: string | null | undefined,
  quantities: QuantitySpec[],
): string {
  return quantityHint(quantity, unit, quantities) ?? "—";
}

function QuantityField({
  quantities,
  value,
  onChange,
  testId,
  disabled,
}: {
  quantities: QuantitySpec[];
  value: string | null;
  onChange: (quantity: string | null) => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="calc-row__qty nodrag nopan nowheel"
      value={value ?? ""}
      data-testid={testId}
      disabled={disabled}
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
