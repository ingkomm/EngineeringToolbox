from pathlib import Path
import json
import pytest

from engcalc.engine import evaluate_project
from engcalc.models import ProjectDocument

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def load_prototype():
    return json.loads(EXAMPLES.read_text())


def test_memo_is_not_evaluated():
    payload = load_prototype()
    payload["objects"].append(
        {
            "kind": "memo",
            "id": "m_testmemo",
            "title": "Note",
            "tags": [{"label": "CW", "normalizedKey": "cw"}],
            "blocks": [{"type": "text", "id": "b1", "order": 0, "content": "hello", "format": "plain"}],
            "links": [
                {
                    "id": "l1",
                    "sourceMemoId": "m_testmemo",
                    "targetObjectId": "obj-a",
                    "targetKind": "calculation",
                    "relation": "reference",
                }
            ],
            "position": {"x": 10, "y": 10},
            "size": {"width": 220, "height": 148},
        }
    )
    result = evaluate_project(ProjectDocument.model_validate(payload))
    assert "m_testmemo" not in result.evaluatedObjectIds
    assert set(result.evaluatedObjectIds) == {"obj-a", "obj-b"}
    obj_a = next(obj for obj in result.project.objects if obj.id == "obj-a")
    power = next(item for item in obj_a.outputs if item.id == "POWER")
    assert power.value == 360


def test_memo_parent_cycle_rejected():
    payload = {
        "id": "ws",
        "name": "ws",
        "objects": [
            {
                "kind": "memo",
                "id": "m1",
                "position": {"x": 0, "y": 0},
                "size": {"width": 220, "height": 148},
                "parentId": "m2",
                "tags": [],
                "blocks": [],
                "links": [],
            },
            {
                "kind": "memo",
                "id": "m2",
                "position": {"x": 1, "y": 0},
                "size": {"width": 220, "height": 148},
                "parentId": "m1",
                "tags": [],
                "blocks": [],
                "links": [],
            },
        ],
        "edges": [],
    }
    with pytest.raises(ValueError, match="MEMO_PARENT_CYCLE"):
        ProjectDocument.model_validate(payload)


def test_unknown_link_target_rejected():
    payload = {
        "id": "ws",
        "name": "ws",
        "objects": [
            {
                "kind": "memo",
                "id": "m1",
                "position": {"x": 0, "y": 0},
                "size": {"width": 220, "height": 148},
                "tags": [],
                "blocks": [],
                "links": [
                    {
                        "id": "l1",
                        "sourceMemoId": "m1",
                        "targetObjectId": "missing",
                        "targetKind": "calculation",
                        "relation": "reference",
                    }
                ],
            }
        ],
        "edges": [],
    }
    with pytest.raises(ValueError, match="UNKNOWN_MEMO_LINK_TARGET"):
        ProjectDocument.model_validate(payload)


def test_flow_diagram_roundtrip_is_not_evaluated():
    payload = load_prototype()
    payload["objects"].append(
        {
            "kind": "memo",
            "id": "m_flow",
            "title": "절차",
            "tags": [],
            "blocks": [
                {
                    "type": "flow-diagram",
                    "id": "bflow",
                    "order": 0,
                    "collapsed": False,
                    "nodes": [
                        {"id": "n1", "shape": "start-end", "text": "시작", "position": {"x": 40, "y": 40}},
                        {"id": "n2", "shape": "process", "text": "판단", "position": {"x": 40, "y": 120}},
                    ],
                    "edges": [{"id": "e1", "source": "n1", "target": "n2", "label": "다음"}],
                }
            ],
            "links": [],
            "position": {"x": 10, "y": 10},
            "size": {"width": 220, "height": 148},
        }
    )
    document = ProjectDocument.model_validate(payload)
    memo = next(obj for obj in document.objects if obj.id == "m_flow")
    block = memo.blocks[0]
    assert block.type == "flow-diagram"
    assert block.nodes[0].position.x == 40
    assert block.edges[0].label == "다음"
    result = evaluate_project(document)
    assert "m_flow" not in result.evaluatedObjectIds
    obj_a = next(obj for obj in result.project.objects if obj.id == "obj-a")
    power = next(item for item in obj_a.outputs if item.id == "POWER")
    assert power.value == 360
