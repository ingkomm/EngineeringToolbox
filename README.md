# Engineering Toolbox

Thermoflex raw data를 입력으로 하는 엔지니어링 계산 툴박스의 첫 프로토타입.

React Flow Canvas의 **Calculation Object** 안에서 Input / Calculation / Output 테이블이 Excel처럼 의미 기반 Variable ID로 연동되고, 실제 계산은 Python이 수행한다.

## Architectural boundaries

- Python: Engineering Calculation, validation, dependency, incremental recalculation
- React + TypeScript + React Flow: Canvas, 입력 UI, 결과 표시. **계산 로직 없음**
- 통신: JSON HTTP API (`POST /api/v1/evaluate`)
- Node/Edge는 계산식이 아니라 Data Mapping / Dependency
- 이 프로토타입에는 Pump, Hydraulic, Thermoflex, Revision이 없다

설계 상세: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Prototype example

Object A

- `FLOW = 120`, `PIN = 12`, `POUT = 15`
- `DP = POUT - PIN`
- `POWER = FLOW * DP`

Object B

- `INPUT_POWER` ← Object A `POWER`
- `RESULT = INPUT_POWER * 2`

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
