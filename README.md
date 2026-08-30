# Engineering Toolbox

React Flow 캔버스에서 **Calculation**, **Memo**, **Arrangement**를 같은 워크시트에 두는 v0.1 엔지니어링 계산 툴박스.

- **Calculation**: Input / Calculation / Output 테이블. 의미 기반 Variable ID로 값을 연동하고, 실제 계산은 Python이 수행한다. 카드는 항상 펼친 상태이며 폭만 조절한다.
- **Memo**: 제목·마크다운·표. 계산하지 않으며 Calculation/Arrangement에 흰 점선으로만 붙는다.
- **Arrangement**: Equipment 심볼과 **Point**. Point는 SYSTEM이 아니라 Arrangement Symbols에서 배치한다. 도면이며 계산하지 않는다.

입력값은 선택한 **SI 단위** 기준이다. 이 버전에는 단위 변환 시스템이 없다.

## Architectural boundaries

- Python: Engineering Calculation, validation, dependency, incremental recalculation
- React + TypeScript + React Flow: Canvas, 입력 UI, 결과 표시. **계산 로직 없음**
- 통신: JSON HTTP API (`POST /api/v1/evaluate`)
- Node/Edge는 계산식이 아니라 Data Mapping / Dependency
- 이 프로토타입에는 Pump 성능곡선, Hydraulic, Thermoflex, Revision이 없다

저장 JSON은 `schemaVersion: "0.1"`을 가진다. 필드가 없는 기존 JSON도 불러올 수 있다.

설계 상세: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Prototype example

Object A

- `FLOW = 120` `volume_flow` (m3/s), `PIN = 12`, `POUT = 15` (Pa)
- `DP = POUT - PIN`
- `POWER = FLOW * DP`

Object B

- `POWER` ← Object A `POWER`
- `RESULT = POWER * 2`

`FLOW`를 바꾸면 `POWER`와 `RESULT`만 dependency graph를 따라 재계산된다.

## Run

Backend:

```bash
cd backend
python3 -m pip install -e ".[dev]"
python3 -m uvicorn engcalc.api:app --host 0.0.0.0 --port 8000
```

GUI 없이 엔진만 실행:

```bash
cd backend
python3 -m engcalc.cli examples/prototype.json
python3 -m pytest
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

브라우저: `http://localhost:5173`
