# Engineering Toolbox Prototype — Architecture

이 문서는 첫 프로토타입의 Data Model, Variable Model, Node/Port/Edge Model, Python Calculation Interface를 정의한다.

구현은 이 계약을 따른다. Architectural boundary는 사용자 승인 없이 변경하지 않는다.

## 1. Architectural Boundaries

```
┌─────────────────────────────────────────────────────────┐
│  React + TypeScript + React Flow                         │
│  - Canvas, Node, Edge, Port 조작                         │
│  - Input 편집, 결과 표시, formatting                     │
│  - Engineering Calculation Logic 금지                    │
└──────────────────────────┬──────────────────────────────┘
                           │ JSON / HTTP
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Python Calculation Backend                              │
│  - Formula 평가                                          │
│  - Validation                                            │
│  - Intra-object / Inter-object Dependency                │
│  - Incremental recalculation                             │
│  - GUI 없이 pytest / CLI 로 독립 실행                    │
└─────────────────────────────────────────────────────────┘
```

- Canvas의 Node/Connection은 계산식이 아니라 Engineering Data Mapping과 Dependency를 정의한다.
- AI는 Engineering 판단을 하지 않는다. 관계는 사용자가 정의하고, 계산은 결정론적 Python Module이 수행한다.
- Thermoflex, Pump, Hydraulic, Revision, Design Basis는 이 프로토타입 범위 밖이다. 모델은 이후 Mapping 유지를 위해 Variable ID 기반으로만 설계한다.

## 2. Variable Model

Variable ID는 셀 주소(`A1`, `B2`)가 아니라 의미 기반 식별자다.

- 허용 패턴: `^[A-Za-z_][A-Za-z0-9_]*$`
- 예: `FLOW`, `PIN`, `POUT`, `DP`, `POWER`, `INPUT_POWER`, `RESULT`
- Object 내부에서 ID는 유일하다 (input / calculation namespace). Output port는 로컬 변수를 재노출한다.
- Input과 Calculation 행은 사용자가 임의로 추가/삭제/편집한다. 기본 워크시트는 비어 있다.

각 변수는 SI 표준 물성(`quantity`)과 그에 따른 SI 단위(`unit`)를 가질 수 있다. 카탈로그는 Python이 소유한다 (`GET /api/v1/quantities`).

| quantity | 한글 | SI unit |
|---|---|---|
| pressure | 압력 | Pa |
| temperature | 온도 | K |
| enthalpy | 엔탈피 | J/kg |
| mass_flow | 질량유량 | kg/s |
| volume_flow | 체적유량 | m3/s |
| length | 길이 | m |
| mass | 질량 | kg |
| power | 동력 | W |
| … | … | … |

Edge mapping 시 source/target quantity가 둘 다 지정되어 있고 다르면 `QUANTITY_MISMATCH`. 단위 변환은 이 단계에서 하지 않는다.

| Table | 역할 | 값의 출처 | Port |
|---|---|---|---|
| `input` | 외부 또는 사용자 입력 | 사용자 편집, 또는 Edge mapping | Target (좌측) |
| `calculation` | 같은 Object 내 변수 참조 수식 | Python formula 평가 | 없음 |
| `output` | 다른 Object로 내보내는 값 | 로컬 input/calculation 변수 재노출 | Source (우측) |

Output row는 새로운 수식이 아니라 **로컬 변수를 Port로 expose**한다. `sourceVariableId`가 가리키는 변수의 평가값을 그대로 내보낸다.

Input이 Edge로 연결되면 사용자 편집은 비활성화되고, Source Object의 Output 값이 덮어쓴다.

## 3. Node / Port / Edge Model

### Calculation Object (Node)

React Flow Custom Node. 내부 3개 테이블은 UI 표현이며, 저장 모델은 아래 JSON이다.

### Port

Port는 Variable 단위다. Cell이 아니다.

- Input Port ID: `in:<variableId>`
- Output Port ID: `out:<variableId>`
- Handle은 해당 테이블 row에 붙는다.

### Edge

Edge는 계산식이 아니라 **데이터 매핑**이다.

```
sourceObjectId.outputs[sourceVariableId]
        →  targetObjectId.inputs[targetVariableId]
```

제약:

- Source는 output port여야 한다.
- Target은 input port여야 한다.
- 한 Input은 동시에 하나의 Edge만 받는다 (fan-in 1).
- Fan-out은 허용한다 (한 Output을 여러 Input에 연결).
- Object 그래프에 cycle이 있으면 evaluation error.

## 4. Project Document (저장 JSON)

프론트엔드가 유지하고 백엔드에 보내는 canonical document.

```json
{
  "id": "prototype-1",
  "name": "FLOW-POWER Prototype",
  "objects": [
    {
      "id": "obj-a",
      "name": "Object A",
      "position": { "x": 80, "y": 120 },
      "inputs": [
        { "id": "FLOW", "value": 120, "unit": null },
        { "id": "PIN", "value": 12, "unit": null },
        { "id": "POUT", "value": 15, "unit": null }
      ],
      "calculations": [
        { "id": "DP", "formula": "POUT - PIN" },
        { "id": "POWER", "formula": "FLOW * DP" }
      ],
      "outputs": [
        { "id": "POWER", "sourceVariableId": "POWER" }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge-a-power-b-input",
      "sourceObjectId": "obj-a",
      "sourceVariableId": "POWER",
      "targetObjectId": "obj-b",
      "targetVariableId": "INPUT_POWER"
    }
  ]
}
```

평가 후 각 변수에 `value`, `status`, `error`가 채워져 돌아온다. 프론트엔드는 이 값을 표시만 한다.

## 5. Formula Language (Python only)

프로토타입 연산자: `+ - * / **` 및 괄호, 숫자 리터럴, Variable ID.

- 셀 주소 없음
- 함수 호출 없음 (후속 모듈에서 확장)
- 다른 Object 변수를 수식에서 직접 참조하지 않음. Cross-object 참조는 Edge mapping만 사용
- 수식 내 이름은 같은 Object의 input/calculation ID만 참조 가능
- AST walk로 평가한다. `eval()` / `exec()` 사용 금지

## 6. Python Calculation Interface

### In-process (GUI 없는 단위 테스트 / CLI)

```python
from engcalc.engine import evaluate_project

result = evaluate_project(project, dirty_object_ids=["obj-a"])
```

### HTTP JSON API

`POST /api/v1/evaluate`

Request:

```json
{
  "project": { "...": "ProjectDocument" },
  "dirtyObjectIds": ["obj-a"]
}
```

`dirtyObjectIds`가 있으면 해당 Object와 다운스트림만 재계산한다. 없거나 비어 있으면 전체 계산.

Response:

```json
{
  "project": { "...": "evaluated ProjectDocument" },
  "evaluatedObjectIds": ["obj-a", "obj-b"],
  "errors": []
}
```

Error item:

```json
{
  "objectId": "obj-a",
  "variableId": "DP",
  "code": "UNRESOLVED_NAME",
  "message": "Unknown variable PINX"
}
```

### Incremental recalculation

1. Edge로부터 Object DAG를 만든다.
2. Cycle이면 `CYCLE_DETECTED`로 실패한다.
3. `dirtyObjectIds`의 descendant closure를 구한다.
4. 영향받는 Object를 topological order로 평가한다.
5. Object 평가 전, inbound Edge로 mapped input 값을 주입한다.
6. Object 내부에서는 formula name dependency로 variable DAG를 만들고 평가한다.

Source 값이 변하지 않은 Object는 재평가하지 않는다. 이 설계가 이후 Thermoflex Heat Balance Revision에서 "변경된 데이터와 영향받는 모듈만 갱신"의 기반이 된다.

## 7. Optional example (참고용, 기본 워크시트 아님)

기본 Canvas는 빈 Calculation Object다. 아래 예제는 참고용으로만 로드한다.

Object A:

| Table | ID | Definition |
|---|---|---|
| Input | FLOW | 120 |
| Input | PIN | 12 |
| Input | POUT | 15 |
| Calculation | DP | `POUT - PIN` |
| Calculation | POWER | `FLOW * DP` |
| Output | POWER | source = POWER |

Object B:

| Table | ID | Definition |
|---|---|---|
| Input | INPUT_POWER | mapped from A.POWER |
| Calculation | RESULT | `INPUT_POWER * 2` |
| Output | RESULT | source = RESULT |

기대값:

- `DP = 15 - 12 = 3`
- `POWER = 120 * 3 = 360`
- `RESULT = 360 * 2 = 720`

`FLOW`를 `200`으로 바꾸면:

- `POWER = 600`
- `RESULT = 1200`

Object A의 PIN/POUT만 바꾸면 Object A와 B가 갱신된다. 매핑되지 않은 독립 Object는 그대로 둔다.

## 8. Frontend 허용 로직

허용:

- JSON 직렬화, React Flow interaction
- 숫자 formatting (`toFixed`)
- mapped input을 read-only로 표시
- debounce 후 evaluate API 호출

금지:

- `POUT - PIN`, `FLOW * DP` 등 수식 평가
- dependency graph 계산
- 값 전파 로직을 클라이언트에서 흉내 내기
