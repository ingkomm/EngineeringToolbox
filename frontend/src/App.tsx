import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { checkHealth, evaluateProject } from "./api/client";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { prototypeProject } from "./example/prototypeProject";
import type { EvalError, ProjectDocument } from "./types/contract";

export function App() {
  const [project, setProject] = useState<ProjectDocument>(prototypeProject);
  const [errors, setErrors] = useState<EvalError[]>([]);
  const [evaluated, setEvaluated] = useState<string[]>([]);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Python 계산 엔진에 연결하는 중");
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
          ? `평가 완료 · 오류 ${result.errors.length}건`
          : `평가 완료 · ${result.evaluatedObjectIds.join(", ") || "none"}`,
      );
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setBackendUp(false);
      setMessage(error instanceof Error ? error.message : "Evaluate request failed");
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await checkHealth();
      setBackendUp(ok);
      if (ok) {
        await runEvaluate(prototypeProject);
      } else {
        setMessage("Python API가 실행 중이 아닙니다. backend를 먼저 시작하세요.");
      }
    })();
  }, [runEvaluate]);

  const onInputChange = useCallback(
    (objectId: string, variableId: string, raw: string) => {
      const current = projectRef.current;
      const next: ProjectDocument = {
        ...current,
        objects: current.objects.map((object) => {
          if (object.id !== objectId) return object;
          return {
            ...object,
            inputs: object.inputs.map((item) => {
              if (item.id !== variableId) return item;
              const value = raw === "" ? null : Number(raw);
              return { ...item, value: value !== null && Number.isNaN(value) ? item.value : value };
            }),
          };
        }),
      };
      setProject(next);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runEvaluate(next, [objectId]);
      }, 280);
    },
    [runEvaluate],
  );

  const mappingJson = useMemo(
    () =>
      JSON.stringify(
        {
          objects: project.objects.map((object) => ({
            id: object.id,
            name: object.name,
            inputs: object.inputs.map((item) => item.id),
            calculations: object.calculations.map((item) => ({ id: item.id, formula: item.formula })),
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
          <p className="topbar__kicker">Engineering Toolbox · Prototype 1</p>
          <h1>Calculation Object Canvas</h1>
        </div>
        <div className="topbar__meta">
          <span className={`pill ${backendUp ? "pill--ok" : "pill--bad"}`}>
            {backendUp ? "Python API" : "API offline"}
          </span>
          <span className="pill">{busy ? "계산 중" : message}</span>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => void runEvaluate(project)}
            disabled={busy || backendUp === false}
          >
            전체 재계산
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-pane">
          <ReactFlowProvider>
            <FlowCanvas
              project={project}
              onProjectChange={setProject}
              onGraphEvaluate={(next, dirty) => void runEvaluate(next, dirty)}
              onInputChange={onInputChange}
            />
          </ReactFlowProvider>
        </section>
        <aside className="side-pane">
          <section>
            <h2>Mapping JSON</h2>
            <p className="side-pane__hint">
              Node/Edge는 계산식이 아니라 데이터 매핑입니다. 수식 평가는 Python만 수행합니다.
            </p>
            <pre>{mappingJson}</pre>
          </section>
          <section>
            <h2>마지막 평가</h2>
            <p>재계산된 Object: {evaluated.length ? evaluated.join(", ") : "—"}</p>
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
