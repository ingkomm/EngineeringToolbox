import type { FlowDiagramBlock, FlowNode } from "../types/contract";
import { newStableId } from "../lib/ids";
import type { WorkspaceEdit } from "../lib/projectEdits";

export function FlowDiagramPreview({ block }: { block: FlowDiagramBlock }) {
  return (
    <svg viewBox="0 0 260 120" className="flow-preview" aria-hidden>
      {block.edges.map((edge) => {
        const source = block.nodes.find((item) => item.id === edge.source);
        const target = block.nodes.find((item) => item.id === edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={edge.id}
            x1={source.position.x / 2 + 20}
            y1={source.position.y / 3 + 10}
            x2={target.position.x / 2 + 20}
            y2={target.position.y / 3 + 10}
            stroke="#94a3b8"
            strokeWidth="1"
          />
        );
      })}
      {block.nodes.map((node) => (
        <g key={node.id}>
          <rect x={node.position.x / 2} y={node.position.y / 3} width="48" height="18" rx={node.shape === "start-end" ? 9 : 2} fill="#1e2937" stroke="#64748b" />
          <text x={node.position.x / 2 + 4} y={node.position.y / 3 + 12} fill="#cbd5e1" fontSize="8">
            {node.text.slice(0, 8)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function FlowDiagramEditor({
  memoId,
  block,
  onEdit,
}: {
  memoId: string;
  block: FlowDiagramBlock;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const patch = (next: Partial<FlowDiagramBlock>) =>
    onEdit({ type: "updateMemoBlock", objectId: memoId, blockId: block.id, patch: next });

  const addNode = (shape: FlowNode["shape"]) => {
    const id = newStableId("n");
    patch({
      nodes: [...block.nodes, { id, shape, text: shape, position: { x: 40 + block.nodes.length * 12, y: 40 + block.nodes.length * 28 } }],
    });
  };

  return (
    <div className="flow-editor">
      <p className="flow-editor__hint">시각적 사고 기록입니다. 실행되지 않습니다.</p>
      <FlowDiagramPreview block={block} />
      <div className="flow-editor__tools">
        <button type="button" onClick={() => addNode("process")}>Process</button>
        <button type="button" onClick={() => addNode("decision")}>Decision</button>
        <button type="button" onClick={() => addNode("start-end")}>Start/End</button>
        <button type="button" onClick={() => addNode("note")}>Note</button>
      </div>
      {block.nodes.map((node) => (
        <div key={node.id} className="flow-editor__node">
          <span>{node.shape}</span>
          <input
            value={node.text}
            onChange={(event) =>
              patch({ nodes: block.nodes.map((item) => (item.id === node.id ? { ...item, text: event.target.value } : item)) })
            }
          />
          <button type="button" onClick={() => patch({ nodes: block.nodes.filter((item) => item.id !== node.id), edges: block.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id) })}>
            ×
          </button>
        </div>
      ))}
      {block.edges.map((edge) => (
        <div key={edge.id} className="flow-editor__node">
          <span>
            {block.nodes.find((item) => item.id === edge.source)?.text} → {block.nodes.find((item) => item.id === edge.target)?.text}
          </span>
          <input
            placeholder="label"
            value={edge.label ?? ""}
            onChange={(event) =>
              patch({ edges: block.edges.map((item) => (item.id === edge.id ? { ...item, label: event.target.value } : item)) })
            }
          />
          <button type="button" onClick={() => patch({ edges: block.edges.filter((item) => item.id !== edge.id) })}>
            ×
          </button>
        </div>
      ))}
      <select
        defaultValue=""
        onChange={(event) => {
          const [source, target] = event.target.value.split(">");
          event.target.value = "";
          if (!source || !target) return;
          patch({ edges: [...block.edges, { id: newStableId("e"), source, target }] });
        }}
      >
        <option value="">연결 추가…</option>
        {block.nodes.flatMap((source) =>
          block.nodes
            .filter((target) => target.id !== source.id)
            .map((target) => (
              <option key={`${source.id}-${target.id}`} value={`${source.id}>${target.id}`}>
                {source.text} → {target.text}
              </option>
            )),
        )}
      </select>
    </div>
  );
}
