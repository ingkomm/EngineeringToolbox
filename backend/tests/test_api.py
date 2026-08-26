from fastapi.testclient import TestClient

from engcalc.api import app
from engcalc.models import ProjectDocument

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_evaluate_endpoint_prototype() -> None:
    from pathlib import Path

    project = ProjectDocument.model_validate_json(
        (Path(__file__).resolve().parents[1] / "examples" / "prototype.json").read_text()
    )
    response = client.post(
        "/api/v1/evaluate",
        json={"project": project.model_dump(), "dirtyObjectIds": ["obj-a"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["evaluatedObjectIds"] == ["obj-a", "obj-b"]
    objects = {obj["id"]: obj for obj in body["project"]["objects"]}
    power = next(item for item in objects["obj-a"]["calculations"] if item["id"] == "POWER")
    result = next(item for item in objects["obj-b"]["calculations"] if item["id"] == "RESULT")
    assert power["value"] == 360.0
    assert result["value"] == 720.0
