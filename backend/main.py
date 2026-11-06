"""
main.py

FastAPI entry point for the AI-Driven Industrial Carbon Footprint &
ESG Intelligence System backend.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import predict, optimize, analytics, reports

app = FastAPI(
    title="Carbon Footprint & ESG Intelligence API",
    description=(
        "Production API powering CarbonIntelligence AI: predicts Scope 3 vendor emissions "
        "(XGBoost, trained on 1,069 companies with self-reported disclosures from CDP / ADEME via NZDPU), optimizes "
        "logistics routing via MILP with honest infeasibility handling, serves analytical "
        "and segment reliability breakdowns, and generates audit-ready ESG PDF reports."
    ),
    version="2.0.0",
)

# Configure CORS: allow_credentials cannot be True with wildcard allow_origins=["*"]
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env.strip():
    allowed_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
    allow_creds = True
else:
    allowed_origins = ["*"]
    allow_creds = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)

app.include_router(predict.router, tags=["Scope 3 Prediction"])
app.include_router(optimize.router, tags=["Logistics Optimization"])
app.include_router(analytics.router, tags=["Analytics & Reliability"])
app.include_router(reports.router, tags=["ESG Reports"])


@app.get("/")
def root():
    return {
        "system": "Carbon Footprint & ESG Intelligence API",
        "status": "operational",
        "version": "2.0.0",
        "docs": "/docs",
        "endpoints": [
            "/predict/scope3",
            "/predict/scope3/batch",
            "/optimize/logistics",
            "/analytics/sector-breakdown",
            "/analytics/jurisdiction-breakdown",
            "/analytics/model-comparison",
            "/analytics/reliability-by-segment",
            "/data/coverage-stats",
            "/reports/generate",
        ],
    }


@app.get("/health")
def health():
    if predict._model is not None:
        return {
            "status": "ok",
            "service": "carbon-footprint-esg-api",
            "model_loaded": True,
            "model_path": predict._model_path_used,
        }
    else:
        return {
            "status": "error",
            "service": "carbon-footprint-esg-api",
            "model_loaded": False,
            "error": predict._model_error or "Model failed to load",
        }
