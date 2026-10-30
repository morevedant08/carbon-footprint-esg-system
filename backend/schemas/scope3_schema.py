"""
schemas/scope3_schema.py

Pydantic request/response models for the /predict/scope3 and /predict/scope3/batch endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class Scope3PredictionRequest(BaseModel):
    company_name: str = Field(..., example="Example Manufacturing Ltd")
    scope_1: float = Field(..., description="Company's Scope 1 emissions (tCO2e)", example=50000.0)
    scope_2: float = Field(..., description="Company's Scope 2 emissions (tCO2e)", example=15000.0)
    sics_sector: str = Field(
        ...,
        description="SICS sector classification",
        example="Resource Transformation"
    )
    jurisdiction: str = Field(..., description="Company headquarters country", example="India")

    # Financials are optional — if not provided, the model falls back to
    # median imputation (same as during training) and flags has_financials=0
    revenue: Optional[float] = Field(None, description="Annual revenue (USD)", example=500000000.0)
    employees: Optional[float] = Field(None, description="Number of employees", example=2500)
    market_cap: Optional[float] = Field(None, description="Market capitalization (USD)", example=1200000000.0)
    ebitda: Optional[float] = Field(None, description="EBITDA (USD)", example=80000000.0)


class SegmentReliability(BaseModel):
    sector: str
    sector_r2: float
    jurisdiction: str
    jurisdiction_r2: float
    revenue_quartile: str
    revenue_quartile_r2: Optional[float] = None
    composite_r2: float
    historical_samples: int
    reliability_tier: str  # "high" (>=0.50), "medium" (0.35-0.49), "low" (<0.35)


class Scope3PredictionResponse(BaseModel):
    company_name: str
    predicted_scope3_tco2e: float
    ci_lower_tco2e: float
    ci_upper_tco2e: float
    confidence_interval_level: str = "80% Prediction Interval"
    used_real_financials: bool
    segment_reliability: SegmentReliability
    reliability_tier: str = "medium"  # "high" | "medium" | "low"
    reliability_note: str = ""
    no_better_than_average: bool = False
    no_better_than_average_note: Optional[str] = None
    extrapolation_warning: bool = False
    extrapolation_note: Optional[str] = None
    interval_method: str = "10th and 90th percentile of out-of-fold log-residuals in matching segment"
    note: str = (
        "Prediction based on an XGBoost model trained on 1,069 companies with self-reported disclosures "
        "(CDP / ADEME via NZDPU) with USD-normalized financials. "
        "Out-of-fold R² indicates directional reliability for this specific segment."
    )


class BatchScope3PredictionResponse(BaseModel):
    total_companies: int
    total_predicted_scope3_tco2e: float
    average_segment_r2: float
    predictions: List[Scope3PredictionResponse]
    sector_summary: Dict[str, Dict[str, Any]]
