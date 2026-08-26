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
  const projectRef = useRef(project);
  const requestSeq = useRef(0);
  projectRef.current = project;

  const runEvaluate = useCallback(async (next: ProjectDocument, dirtyObjectIds?: string[]) => {
    const seq = ++requestSeq.current;
    setBusy(true);
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
      setErrors([]);
      if (result.shouldEvaluate) {
        scheduleEvaluate(result.project, result.dirtyObjectIds);
      } else {
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
            inputs: object.inputs.map((item) => ({ id: item.id, quantity: item.quantity ?? null, unit: item.unit ?? null })),
            calculations: object.calculations.map((item) => ({
              id: item.id,
              formula: item.formula,
              quantity: item.quantity ?? null,
            })),
            outputs: object.outputs.map((item) => ({ id: item.id, sourceVariableId: item.sourceVariableId })),
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
          <span className={`pill ${backendUp ? "pill--ok" : "pill--bad"}`}>
            {backendUp ? "Python API" : "API offline"}
          </span>
          <span className="pill">{busy ? "계산 중" : message}</span>
          <button className="ghost-btn" type="button" onClick={() => onEdit({ type: "newWorkspace" })}>
            새 워크시트
          </button>
          <button
            className="ghost-btn"
            type="button"
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
              onGraphEvaluate={(next, dirty) => void runEvaluate(next, dirty)}
              onEdit={onEdit}
            />
          </ReactFlowProvider>
        </section>
        <aside className="side-pane">
          <section>
            <h2>워크시트</h2>
            <p className="side-pane__hint">
              빈 객체에서 Input/Calculation을 직접 작성합니다. 연결은 데이터 매핑이고, 수식 평가는 Python만 수행합니다.
              결과는 수식과 값이 있을 때만 계산됩니다.
            </p>
            <button className="ghost-btn" type="button" onClick={() => onEdit({ type: "loadExample" })}>
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
            <pre>{mappingJson}</pre>
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
