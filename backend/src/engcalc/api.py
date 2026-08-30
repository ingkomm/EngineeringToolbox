from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engcalc.engine import evaluate_project
from engcalc.models import EvaluateRequest, EvaluateResponse
from engcalc.quantities import QUANTITIES

app = FastAPI(title="Engineering Toolbox Calculation API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/quantities")
def list_quantities() -> dict[str, object]:
    return {"quantities": list(QUANTITIES)}


@app.post("/api/v1/evaluate", response_model=EvaluateResponse)
def evaluate(request: EvaluateRequest) -> EvaluateResponse:
    return evaluate_project(request.project, request.dirtyObjectIds)
