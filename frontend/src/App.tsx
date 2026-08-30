import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { checkHealth, evaluateProject, fetchQuantities } from "./api/client";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { IsoSymbolSidebar } from "./canvas/IsoSymbolSidebar";
import { blankProject } from "./example/blankProject";
import { FALLBACK_QUANTITIES, type QuantitySpec } from "./lib/quantities";
import { applyWorkspaceEdit, type WorkspaceEdit } from "./lib/projectEdits";
import type { EvalError, ProjectDocument } from "./types/contract";
import { isEquipmentObject, isPointObject } from "./lib/worksheet";
import { isMemoObject } from "./lib/memo";

export function App() {
  const [project, setProject] = useState<ProjectDocument>(blankProject);
  const [quantities, setQuantities] = useState<QuantitySpec[]>(FALLBACK_QUANTITIES);
  const [errors, setErrors] = useState<EvalError[]>([]);
  const [evaluated, setEvaluated] = useState<string[]>([]);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("변수와 수식을 직접 정의하세요");
  const pastRef = useRef<ProjectDocument[]>([]);
  const futureRef = useRef<ProjectDocument[]>([]);
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
    let cancelled = false;
    let lastOk: boolean | null = null;
    const poll = async () => {
      const ok = await checkHealth();
      if (cancelled) return;
      setBackendUp(ok);
      if (ok) {
        if (lastOk !== true) {
          setQuantities(await fetchQuantities());
        }
      } else if (lastOk !== false) {
        setMessage("Python API가 실행 중이 아닙니다. backend를 먼저 시작하세요.");
      }
      lastOk = ok;
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const remember = useCallback((previous: ProjectDocument) => {
    pastRef.current = [...pastRef.current.slice(-79), previous];
    futureRef.current = [];
  }, []);

  const onEdit = useCallback(
    (edit: WorkspaceEdit) => {
      const previous = projectRef.current;
      const result = applyWorkspaceEdit(previous, edit, quantities);
      if (result.project !== previous) remember(previous);
      setProject(result.project);
      if (result.shouldEvaluate) {
        scheduleEvaluate(result.project, result.dirtyObjectIds);
      } else {
        setErrors([]);
        setMessage("변수와 수식을 직접 정의하세요");
        setEvaluated([]);
      }
    },
    [quantities, remember, scheduleEvaluate],
  );

  const onProjectChange = useCallback(
    (next: ProjectDocument) => {
      remember(projectRef.current);
      setProject(next);
    },
    [remember],
  );

  const onUndo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(projectRef.current);
    setProject(previous);
  }, []);

  const onRedo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(projectRef.current);
    setProject(next);
  }, []);

  const mappingJson = useMemo(
    () =>
      JSON.stringify(
        {
          objects: project.objects.map((object) => {
            if (isEquipmentObject(object)) {
              return {
                kind: "equipment",
                id: object.id,
                name: object.name,
                tag: object.tag ?? "",
                symbolId: object.symbolId,
                rotation: object.rotation ?? 0,
                position: object.position,
                inCount: object.inCount,
                outCount: object.outCount,
              };
            }
            if (isPointObject(object)) {
              return {
                kind: "point",
                id: object.id,
                name: object.name,
                position: object.position,
                connectionCount: object.connectionCount,
                connections: object.connections,
              };
            }
            if (isMemoObject(object)) {
              return {
                kind: "memo",
                id: object.id,
                title: object.title,
                content: object.content,
                tables: object.tables,
                links: object.links,
              };
            }
            return {
              kind: "calculation",
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
              links: (object.links ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                targetObjectId: item.targetObjectId ?? null,
                targetPortId: item.targetPortId ?? null,
              })),
            };
          }),
          edges: project.edges,
        },
        null,
        2,
      ),
    [project],
  );

  const onExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.id || "worksheet"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const onImportFile = useCallback(
    (file: File) => {
      void file.text().then((text) => {
        try {
          const parsed = JSON.parse(text) as ProjectDocument;
          if (!parsed || !Array.isArray(parsed.objects) || !Array.isArray(parsed.edges)) {
            setMessage("가져오기 실패: 프로젝트 JSON이 아닙니다");
            return;
          }
          onEdit({ type: "loadProject", project: parsed });
        } catch {
          setMessage("가져오기 실패: JSON을 읽을 수 없습니다");
        }
      });
    },
    [onEdit],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="topbar__kicker">Engineering Toolbox</p>
          <h1>Calculation Object Canvas</h1>
        </div>
        <div className="topbar__meta">
          <span
            className={`pill ${backendUp ? "pill--ok" : backendUp === false ? "pill--bad" : ""}`}
            data-testid="api-status"
          >
            {backendUp == null ? "API…" : backendUp ? "Python API" : "API offline"}
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
          <button className="ghost-btn" type="button" data-testid="btn-export-project" onClick={onExport}>
            저장
          </button>
          <label className="ghost-btn" data-testid="btn-import-project">
            불러오기
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImportFile(file);
              }}
            />
          </label>
        </div>
      </header>

      <main className="workspace">
        <IsoSymbolSidebar project={project} onEdit={onEdit} />
        <section className="canvas-pane">
          <ReactFlowProvider>
            <FlowCanvas
              project={project}
              quantities={quantities}
              onProjectChange={onProjectChange}
              onEdit={onEdit}
              onUndo={onUndo}
              onRedo={onRedo}
            />
          </ReactFlowProvider>
        </section>
        <aside className="side-pane">
          <section>
            <h2>워크시트</h2>
            <p className="side-pane__hint">
              Calculation Object는 카드 UI를 유지합니다. Point와 Calculation은 SYSTEM 고정 항목입니다.
              Pump/Valve/Vessel과 사용자 SVG는 Arrangement Symbol이며 라이브러리에서 편집·삭제합니다.
              Equipment와 Point는 P&ID 도면 심볼이며 계산하지 않습니다. Calc Input은 하늘색, Calc Output은
              초록색, Arrangement Point는 노란색입니다. Pipe/Signal은 값 연동(value flow)과 섞이지 않습니다.
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
