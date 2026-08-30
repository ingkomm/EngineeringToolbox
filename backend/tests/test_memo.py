from pathlib import Path
import json

from engcalc.engine import evaluate_project
from engcalc.models import ProjectDocument

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "prototype.json"


def test_memo_is_not_evaluated():
    payload = json.loads(EXAMPLES.read_text())
    payload["objects"].append(
        {
            "kind": "memo",
            "id": "m_testmemo",
            "title": "Note",
            "sections": [
                {"type": "text", "id": "s1", "content": "**remember**"},
                {"type": "table", "id": "s2", "cells": [["a", "b"], ["1", "2"]]},
            ],
            "links": [{"id": "l1", "memoId": "m_testmemo", "targetObjectId": "obj-a"}],
            "position": {"x": 10, "y": 10},
            "size": {"width": 200, "height": 140},
        }
    )
    result = evaluate_project(ProjectDocument.model_validate(payload))
    assert "m_testmemo" not in result.evaluatedObjectIds
    assert set(result.evaluatedObjectIds) == {"obj-a", "obj-b"}
    obj_a = next(obj for obj in result.project.objects if obj.id == "obj-a")
    power = next(item for item in obj_a.outputs if item.id == "POWER")
    assert power.value == 360
