from fastapi.testclient import TestClient

from engcalc.api import app

client = TestClient(app)


def test_user_authored_worksheet_evaluates_through_python() -> None:
    """Same document the UI would POST after the user writes tables and a mapping edge."""
    project = {
        "id": "workspace-1",
        "name": "Engineering Workspace",
        "objects": [
            {
                "id": "obj_1",
                "name": "Object 1",
                "position": {"x": 80, "y": 88},
                "inputs": [
                    {"id": "FLOW", "value": 120, "quantity": "volume_flow"},
                    {"id": "PIN", "value": 12, "quantity": "pressure"},
                    {"id": "POUT", "value": 15, "quantity": "pressure"},
                ],
                "calculations": [
                    {"id": "DP", "formula": "POUT - PIN", "quantity": "pressure"},
                    {"id": "POWER", "formula": "FLOW * DP", "quantity": "power"},
                ],
                "outputs": [{"id": "POWER", "sourceVariableId": "POWER"}],
            },
            {
                "id": "obj_2",
                "name": "Object 2",
                "position": {"x": 560, "y": 88},
                "inputs": [{"id": "INPUT_POWER", "value": None, "quantity": "power"}],
                "calculations": [
                    {"id": "RESULT", "formula": "INPUT_POWER * 2", "quantity": "power"},
                ],
                "outputs": [{"id": "RESULT", "sourceVariableId": "RESULT"}],
            },
        ],
        "edges": [
            {
                "id": "edge-obj_1-POWER-obj_2-INPUT_POWER",
                "sourceObjectId": "obj_1",
                "sourceVariableId": "POWER",
                "targetObjectId": "obj_2",
                "targetVariableId": "INPUT_POWER",
            }
        ],
    }

    response = client.post("/api/v1/evaluate", json={"project": project})
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    objects = {obj["id"]: obj for obj in body["project"]["objects"]}

    flow = next(item for item in objects["obj_1"]["inputs"] if item["id"] == "FLOW")
    dp = next(item for item in objects["obj_1"]["calculations"] if item["id"] == "DP")
    power = next(item for item in objects["obj_1"]["calculations"] if item["id"] == "POWER")
    mapped = next(item for item in objects["obj_2"]["inputs"] if item["id"] == "POWER")
    result = next(item for item in objects["obj_2"]["calculations"] if item["id"] == "RESULT")

    assert flow["unit"] == "m3/s"
    assert dp["value"] == 3.0 and dp["quantity"] == "pressure" and dp["unit"] == "Pa"
    assert power["value"] == 360.0
    assert power["quantity"] == "power"
    assert power["unit"] == "W"
    assert mapped["status"] == "mapped" and mapped["value"] == 360.0
    assert mapped["name"] == "POWER"
    assert mapped["quantity"] == "power"
    assert mapped["unit"] == "W"
    assert result["formula"] == "POWER * 2"
    assert result["value"] == 720.0

    flow["value"] = 200
    again = client.post(
        "/api/v1/evaluate",
        json={"project": body["project"], "dirtyObjectIds": ["obj_1"]},
    )
    objects = {obj["id"]: obj for obj in again.json()["project"]["objects"]}
    power = next(item for item in objects["obj_1"]["calculations"] if item["id"] == "POWER")
    result = next(item for item in objects["obj_2"]["calculations"] if item["id"] == "RESULT")
    assert power["value"] == 600.0
    assert result["value"] == 1200.0
