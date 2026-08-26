import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { checkHealth, evaluateProject, fetchQuantities } from "./api/client";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { blankProject } from "./example/blankProject";
import { FALLBACK_QUANTITIES, type QuantitySpec } from "./lib/quantities";
import { applyWorkspaceEdit, type WorkspaceEdit } from "./lib/projectEdits";
import type { EvalError, ProjectDocument } from "./types/contract";

export function App() {
  const [project, setProject] = useState<ProjectDocument>(blankProject);
  const [quantities, setQuantities] = useState<QuantitySpec[]>(FALLBACK_QUANTITIES);
  const [errors, setErrors] = useState<EvalError[]>([]);
  const [evaluated, setEvaluated] = useState<string[]>([]);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("변수와 수식을 직접 정의하세요");
  const debounceRef = useRef<number | null>(null);
  const busyTimerRef = useRef<number | null>(null);
  const projectRef = useRef(project);
  const requestSeq = useRef(0);
  projectRef.current = project;

  const runEvaluate = useCallback(async (next: ProjectDocument, dirtyObjectIds?: string[]) => {
    const seq = ++requestSeq.current;
    if (busyTimerRef.current) window.clearTimeout(busyTimerRef.current);
    busyTimerRef.current = window.setTimeout(() => {
      if (seq === requestSeq.current) setBusy(true);
    }, 280);
    try {
      const result = await evaluateProject(next, dirtyObjectIds);
      if (seq !== requestSeq.current) return;
      setProject(result.project);
      setErrors(result.errors);
      setEvaluated(result.evaluatedObjectIds);
      setBackendUp(true);
      setMessage(
        result.errors.length
          ? `계산 오류 ${result.errors.length}건`
          : result.evaluatedObjectIds.length
            ? `계산 완료 · ${result.evaluatedObjectIds.join(", ")}`
            : "계산할 수식이 없습니다",
      );
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setBackendUp(false);
      setMessage(error instanceof Error ? error.message : "Evaluate request failed");
    } finally {
      if (busyTimerRef.current) {
        window.clearTimeout(busyTimerRef.current);
        busyTimerRef.current = null;
      }
      if (seq === requestSeq.current) setBusy(false);
    }
  }, []);

  const scheduleEvaluate = useCallback(
    (next: ProjectDocument, dirtyObjectIds?: string[]) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runEvaluate(next, dirtyObjectIds);
      }, 320);
    },
    [runEvaluate],
  );

  useEffect(() => {
    void (async () => {
      const ok = await checkHealth();
      setBackendUp(ok);
      setQuantities(await fetchQuantities());
      if (!ok) {
        setMessage("Python API가 실행 중이 아닙니다. backend를 먼저 시작하세요.");
      }
    })();
  }, []);

  const onEdit = useCallback(
    (edit: WorkspaceEdit) => {
      const result = applyWorkspaceEdit(projectRef.current, edit, quantities);
      setProject(result.project);
      if (result.shouldEvaluate) {
        scheduleEvaluate(result.project, result.dirtyObjectIds);
      } else {
        setErrors([]);
        setMessage("변수와 수식을 직접 정의하세요");
        setEvaluated([]);
      }
    },
    [quantities, scheduleEvaluate],
  );

  const mappingJson = useMemo(
    () =>
      JSON.stringify(
        {
          objects: project.objects.map((object) => ({
            id: object.id,
            name: object.name,
            inputs: object.inputs.map((item) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
            })),
            calculations: object.calculations.map((item) => ({
              id: item.id,
              name: item.name,
              formula: item.formula,
              quantity: item.quantity ?? null,
            })),
            outputs: object.outputs.map((item) => ({ id: item.id, name: item.name, sourceVariableId: item.sourceVariableId })),
          })),
          edges: project.edges,
        },
        null,
        2,
      ),
    [project],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="topbar__kicker">Engineering Toolbox</p>
          <h1>Calculation Object Canvas</h1>
        </div>
        <div className="topbar__meta">
          <span className={`pill ${backendUp ? "pill--ok" : "pill--bad"}`} data-testid="api-status">
            {backendUp ? "Python API" : "API offline"}
          </span>
          <span className="pill" data-testid="eval-status">{busy ? "계산 중" : message}</span>
          <button
            className="ghost-btn"
            type="button"
            data-testid="btn-new-worksheet"
            onClick={() => onEdit({ type: "newWorkspace" })}
          >
            새 워크시트
          </button>
          <button
            className="ghost-btn"
            type="button"
            data-testid="btn-evaluate"
            onClick={() => void runEvaluate(project)}
            disabled={busy || backendUp === false}
          >
            계산
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-pane">
          <ReactFlowProvider>
            <FlowCanvas
              project={project}
              quantities={quantities}
              onProjectChange={setProject}
              onEdit={onEdit}
            />
          </ReactFlowProvider>
        </section>
        <aside className="side-pane">
          <section>
            <h2>워크시트</h2>
            <p className="side-pane__hint">
              Object와 변수의 ID/이름은 워크시트에서 유일합니다. 커넥터 ⌕ 검색으로 다른 객체를 찾아 연결하고,
              검색창에서 기존 링크 상태를 보거나 끊을 수 있습니다. 링크 버튼으로 선을 접으면 포트 옆 링크 버튼만 남습니다.
            </p>
            <button
              className="ghost-btn"
              type="button"
              data-testid="btn-load-example"
              onClick={() => onEdit({ type: "loadExample" })}
            >
              참고 예제 열기
            </button>
          </section>
          <section>
            <h2>SI 표준 물성</h2>
            <ul className="qty-list">
              {quantities.map((item) => (
                <li key={item.id}>
                  <strong>{item.nameKo}</strong>
                  <span>
                    {item.siUnit}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Mapping JSON</h2>
            <pre data-testid="mapping-json">{mappingJson}</pre>
          </section>
          <section>
            <h2>마지막 계산</h2>
            <p>대상: {evaluated.length ? evaluated.join(", ") : "—"}</p>
            {errors.length === 0 ? (
              <p className="ok-text">오류 없음</p>
            ) : (
              <ul className="error-list">
                {errors.map((error, index) => (
                  <li key={`${error.code}-${index}`}>
                    <strong>{error.code}</strong> {error.objectId}/{error.variableId}: {error.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
