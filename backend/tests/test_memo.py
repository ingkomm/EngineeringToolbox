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
