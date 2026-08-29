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
- 예: `FLOW`, `PIN`, `POUT`, `DP`, `POWER`, `RESULT`
- ID와 이름(name)은 워크시트 **전역**에서 유일하다. Calculation이 만든 변수가 다른 Object Input으로 연결되면 새 ID를 만들지 않고 같은 ID/이름을 그대로 가져온다.
- Calculation Object의 ID와 이름도 워크시트에서 유일하다.
- 커넥터 `enabled`(On/Off)로 연동을 끊거나 다시 이을 수 있다. Off면 대상 Input은 새로운 로컬 ID를 받는다.
- 커넥터 `collapsed`로 긴 선을 접는다. 접힌 상태에서는 캔버스 선/칩을 그리지 않고 포트 옆 **링크** 버튼만 남긴다. 다시 누르면 전체 선을 그린다.
- 커넥터 검색으로 다른 Object를 ID/이름으로 찾아 연결할 수 있다. 검색 결과는 기존 연결 상태(`연결됨` / `사용 중`)를 보여주고, 현재 포트의 링크는 **끊기**로 해제한다.
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

Edge mapping 시 연결된 Input은 소스 변수의 물성/단위를 그대로 따른다. 상단 소스의 quantity가 바뀌면 다운스트림 mapped Input과 그 수식 유추 단위도 다시 맞춰진다.

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
- 한 Output도 동시에 하나의 Input만 연결한다 (fan-out 1). 같은 Object의 같은 Output이 여러 Input으로 들어가지 않는다.
- Object 그래프에 cycle이 있으면 evaluation error.
- 커넥터 검색: Output/Input 행의 찾기 버튼으로 다른 Object ID/이름을 검색해 연결한다. 결과는 기존 링크 상태(`연결됨` / `사용 중`)를 보여주고, 현재 포트의 링크는 끊을 수 있다.
- `collapsed: true`면 캔버스에 전체 선을 그리지 않고, 포트 옆 **링크** 버튼만 남긴다. Object ID/이름 칩은 표시하지 않는다.

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

엑셀에 가까운 수식. 셀 주소는 없고 Variable ID만 참조한다. `eval()` / `exec()` 사용 금지.

연산자: `+ - * / ^` (지수는 엑셀과 같이 `^`, `**`도 허용), 괄호, 숫자 리터럴, 접미사 `%` (10% = 0.1). 맨 앞 `=` 는 무시한다.

함수 (대소문자 무관):

| 함수 | 의미 |
|---|---|
| `LOG(number, [base])` | 로그. 밑 생략 시 10 |
| `LOG10(number)` | 상용로그 |
| `LN(number)` | 자연로그 |
| `EXP(number)` | e^n |
| `POWER(number, power)` | 거듭제곱 |
| `ROUND(number, [digits])` | 엑셀 ROUND (0.5는 0에서 멀어지는 쪽) |
| `ROUNDUP` / `ROUNDDOWN` / `TRUNC` / `INT` | 올림·내림·절사 |
| `ABS` `SQRT` `SIGN` `MOD` `MIN` `MAX` `PI()` | 기본 수학 |

- 다른 Object 변수를 수식에서 직접 참조하지 않음. Cross-object 참조는 Edge mapping만 사용
- 수식 내 이름은 같은 Object의 input/calculation ID만 참조 가능
- AST walk로 평가한다

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
- 사용자가 Input/Calculation 행을 추가·수정하는 mapping 편집

금지:

- `POUT - PIN`, `FLOW * DP` 등 수식 평가
- dependency graph 계산
- 값 전파 로직을 클라이언트에서 흉내 내기

## 9. UI test IDs

브라우저 검증은 화면에서 버튼을 추측하지 않고 아래 testid만 사용한다.

| testid | 위치 | 동작 |
|---|---|---|
| `btn-new-worksheet` | 상단 바 | `newWorkspace` |
| `btn-evaluate` | 상단 바 | `POST /api/v1/evaluate` |
| `btn-add-object` | Canvas Panel top-left | `addObject` (Calculation Object) |
| `btn-add-arrangement` | Canvas Panel top-left | `addArrangement` |
| `btn-export-project` | 상단 바 | 프로젝트 JSON 다운로드 |
| `btn-import-project` | 상단 바 | 프로젝트 JSON 불러오기 |
| `btn-load-example` | 우측 사이드바 | `loadExample` |
| `object-{id}-id` | Node 헤더 | Object ID, blur로 commit. 전역 유일 |
| `object-{id}-name` | Node 헤더 | Object 이름, blur로 commit. 전역 유일 |
| `object-{id}-add-input` | Node Input 헤더 | `addInput` |
| `object-{id}-add-calc` | Node Calculation 헤더 | `addCalculation` |
| `object-{id}-add-output` | Node Output 헤더 | `addOutput` |
| `object-{id}-input-{var}-id` | Input 행 | Variable ID, blur로 commit |
| `object-{id}-input-{var}-value` | Input 행 | 값, blur로 commit |
| `object-{id}-input-{var}-quantity` | Input 행 | option `value` = quantity id (`mass_flow`, `pressure`, `power`) |
| `object-{id}-input-{var}-search` | Input 행 | 소스 Object 검색 후 연결 / 끊기 |
| `object-{id}-input-{var}-link` | Input 행 | 링크 접기/펼치기. 접혀도 라벨은 `링크` |
| `object-{id}-calc-{var}-formula` | Calculation 행 | 수식, blur로 commit |
| `object-{id}-output-{var}-search` | Output 행 | 대상 Object 검색 후 연결 / 끊기 |
| `object-{id}-output-{var}-link` | Output 행 | 링크 접기/펼치기. 접혀도 라벨은 `링크` |
| `handle-out-{var}` | Output 행 우측 | RF source handle (`id=out:{var}`) |
| `handle-in-{var}` | Input 행 좌측 | RF target handle (`id=in:{var}`) |
| `edge-{id}-toggle` | 커넥터 | On/Off |
| `edge-{id}-collapse` | 커넥터 | 무선 링크로 접기 |

첫 Input 추가 시 Variable ID는 `IN_1`이다. ID를 `FLOW`로 바꾼 뒤에 testid가 `object-obj_1-input-FLOW-*`로 바뀐다.

Arrangement:

| testid | 위치 | 동작 |
|---|---|---|
| `object-{id}-add-equipment` | Arrangement 툴바 | Equipment 추가 |
| `object-{id}-add-point` | Arrangement 툴바 | Point 추가 |
| `object-{id}-equipment-{eqId}` | 캔버스 | Equipment 선택/이동 |
| `object-{id}-equipment-{eqId}-IN_n` / `OUT_n` | Equipment 포트 | Point 연결 점을 끌어다 놓음 |
| `object-{id}-equipment-{eqId}-in-count` | Inspector | In 포트 개수 |
| `object-{id}-equipment-{eqId}-out-count` | Inspector | Out 포트 개수 |
| `object-{id}-point-{ptId}` | 캔버스 | Point 본체 이동 |
| `object-{id}-point-{ptId}-C_n` | Point 연결 점 | Equipment 포트로 드래그 |
| `object-{id}-point-{ptId}-count` | Inspector | Point 연결 점 개수 |
| `object-{id}-point-{ptId}-id` | Inspector | Point ID |
| `object-{id}-point-{ptId}-name` | Inspector | Point 이름 |

## 10. Arrangement Object

Arrangement는 Equipment와 Point로 계통 배치를 그리는 도면 객체다. 내부에서 공학 계산을 하지 않는다.

이 프로토타입 범위:

- Equipment: 범용 심볼. In/Out 포트 개수를 지정한다. 포트 ID는 `IN_1`… / `OUT_1`…
- Point: 연결 점 개수를 지정하는 막대. 각 점(`C_1`…)을 Equipment In/Out에 드래그 앤 드롭으로 붙인다. 연결선은 꺾은선이다.
- Valve, Pipe, Signal, Annotation은 이 단계에 없다

역할 분리:

- React / React Flow: 화면 렌더링, 생성·이동, Point↔Equipment 드래그 연결
- Python: 도메인 스키마, 저장/불러오기, ID·참조 무결성, Calculation과의 relation, evaluate 시 Arrangement skip

`objects`는 판별 유니온이다. 기존 JSON에 `kind`가 없으면 Calculation Object로 로드한다.

Arrangement 저장 모델은 Domain과 View를 분리한다.

- Domain: Equipment ID/이름/`inCount`/`outCount`, Point ID/이름/`connectionCount`, 각 연결 점 `connections[]`의 `{ equipmentId, portId }`
- View: 워크시트 `position`, 캔버스 크기, `elements[id]` 좌표

Point를 Equipment에 연결하는 것은 Domain이다. Equipment/Point를 화면에서 옮기는 것은 View다.

Point는 워크시트에서 Calculation Object Port와 `association` Edge로 연결할 수 있다. Arrangement에 `value_flow`를 걸면 Python이 `ARRANGEMENT_HAS_NO_VALUE`로 거부한다.

평가 시 Arrangement는 `evaluatedObjectIds`에 넣지 않으며 formula evaluator를 호출하지 않는다.

허용:

- JSON 직렬화, React Flow interaction
- 숫자 formatting (`toFixed`)
- mapped input을 read-only로 표시
- debounce 후 evaluate API 호출

금지:

- `POUT - PIN`, `FLOW * DP` 등 수식 평가
- dependency graph 계산
- 값 전파 로직을 클라이언트에서 흉내 내기
- Arrangement 내부 유량·압력손실·관경·거리 기반 공학 계산
