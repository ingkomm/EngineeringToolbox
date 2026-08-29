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
| `btn-add-equipment` | Canvas Panel top-left | `addEquipment` |
| `btn-add-point` | Canvas Panel top-left | `addPoint` |
| `btn-export-project` | 상단 바 | 프로젝트 JSON 다운로드 |
| `btn-import-project` | 상단 바 | 프로젝트 JSON 불러오기 |
| `btn-load-example` | 우측 사이드바 | `loadExample` |
| `object-{id}-id` | Node 헤더 | Object ID, blur로 commit. 전역 유일. 기본 숨김, hover/선택 시 표시 |
| `object-{id}-name` | Node 헤더 | Object 이름, blur로 commit. 전역 유일 |
| `object-{id}-expand` | Calculation 헤더 | compact/expanded 토글. 선택해도 Input/Calculation/Output/Link가 펼쳐짐 |
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
| `object-{id}-add-link` | Node Link 헤더 | `addLink` |
| `object-{id}-link-{var}-search` | Link 행 | Point / Equipment 객체 검색 후 점선 연결 |
| `object-{id}-link-{var}-target` | Link 행 | 연결된 Point/Equipment 표시 |
| `object-{id}-obj` | 객체 상/하단 | 객체 간 Link 핸들 (`id=OBJ`) |
| `object-{id}-obj-side` | 노란 점 옆 | 상단/하단 위치 토글 |
| `edge-{id}-toggle` | 커넥터 | On/Off |
| `edge-{id}-collapse` | 커넥터 | 무선 링크로 접기 |
| `edge-arrlink:{pointId}:{end}-direction` | Point 연결선 | 화살표 방향 토글 |

첫 Input 추가 시 Variable ID는 `IN_1`이다. ID를 `FLOW`로 바꾼 뒤에 testid가 `object-obj_1-input-FLOW-*`로 바뀐다.

캔버스 기본 표시는 이름·심볼·연결선·주요 값이다. Object ID, 포트명, 방향, 링크 On/Off, 편집/삭제 컨트롤은 hover 또는 선택 시에만 보인다. Calculation Object는 compact가 기본이며, 노드를 선택하거나 `object-{id}-expand`를 눌러야 Input / Calculation / Output / Link 섹션이 펼쳐진다. Equipment / Point / Calculation의 header·border·타이포·포트(10px)는 같은 `--ws-*` 토큰을 쓴다.

Arrangement:

| testid | 위치 | 동작 |
|---|---|---|
| `btn-add-equipment` | 캔버스 패널 | Equipment를 공용 워크시트에 추가 |
| `btn-add-point` | 캔버스 패널 | Point를 공용 워크시트에 추가 |
| `object-{id}` | 워크시트 노드 | Equipment / Point 선택·이동 |
| `object-{id}-IN_n` / `OUT_n` | Equipment 포트 | Point 연결 점과 드래그 연결 |
| `object-{id}-in-count` | Equipment | In 포트 개수 |
| `object-{id}-out-count` | Equipment | Out 포트 개수 |
| `object-{id}-C_1` / `C_2` / `C_3` | Point 좌·우·아래 | Equipment 포트 또는 다른 Point로 드래그 |

## 10. Equipment and Point

Equipment와 Point는 Calculation Object와 **같은 공용 워크시트**에 놓인다. 별도의 Arrangement 창/노드로 감싸지 않는다. 내부에서 공학 계산을 하지 않는다.

이 프로토타입 범위:

- Equipment: 범용 심볼. In/Out 포트 개수를 지정한다. 포트 ID는 `IN_1`… / `OUT_1`…
- Point: 원형 노드. 배관 연결 점은 좌·우·아래 3개(`C_1`/`C_2`/`C_3`)로 고정한다. Equipment In/Out 또는 다른 Point에 드래그로 붙인다. 연결선은 꺾은선이며 화살표 방향은 토글한다.
- Calculation Object Link: 각 객체의 노란 `OBJ` 점에만 붙는 점선 association. 위치는 상단/하단을 고른다. 객체당 하나이며 더블클릭으로 지운다. 값은 흐르지 않는다.
- Valve, Pipe, Signal, Annotation은 이 단계에 없다

역할 분리:

- React / React Flow: 화면 렌더링, 생성·이동, Point↔Equipment/Point 드래그 연결, Link 점선
- Python: 도메인 스키마, 저장/불러오기, ID·참조 무결성, Calculation과의 relation, evaluate 시 Equipment/Point skip

`objects`는 판별 유니온이다. 기존 JSON에 `kind`가 없으면 Calculation Object로 로드한다. 예전 Arrangement 창 JSON(`kind: "arrangement"`)은 로드 시 Equipment/Point 노드로 펼친다.

- Equipment/Point의 워크시트 `position`은 화면 좌표다. 연결(`connections`)은 도메인이다.
- Equipment/Point에 `value_flow`를 걸면 Python이 `ARRANGEMENT_HAS_NO_VALUE`로 거부한다.

평가 시 Equipment/Point는 `evaluatedObjectIds`에 넣지 않으며 formula evaluator를 호출하지 않는다.

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
