"""
routes/predict.py

Loads the trained Scope 3 model once at startup and exposes:
- POST /predict/scope3 (single company with honest segment reliability and confidence intervals)
- POST /predict/scope3/batch (batch prediction via CSV file upload or JSON payload)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
import pandas as pd
import numpy as np
import pickle
import os
import io
import json
from typing import List, Optional

from backend.schemas.scope3_schema import (
    Scope3PredictionRequest,
    Scope3PredictionResponse,
    SegmentReliability,
    BatchScope3PredictionResponse,
)

router = APIRouter()

MODEL_PATHS = [
    "ml/model_artifacts/scope3_xgboost_clean.pkl",
    "ml/model_artifacts/best_model_clean.pkl",
    "ml/model_artifacts/scope3_xgboost_usd.pkl",
    "ml/model_artifacts/scope3_model_usd.pkl",
    "ml/model_artifacts/best_model_usd.pkl",
    "ml/model_artifacts/scope3_xgboost.pkl",
    "ml/model_artifacts/scope3_model.pkl",
    "ml/model_artifacts/best_model.pkl",
]

_model = None
_model_path_used = None

for path in MODEL_PATHS:
    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                _model = pickle.load(f)
            _model_path_used = path
            break
        except Exception:
            continue

TOP_JURISDICTIONS = [
    "Japan",
    "United States of America",
    "United Kingdom of Great Britain and Northern Ireland",
    "Republic of Korea",
    "France",
    "Germany",
    "India",
    "Brazil",
]

# Load reliability dataset for honest segment disclosures (USD clean)
RELIABILITY_PATH = "data/processed/model_reliability_by_segment_clean.csv"
if not os.path.exists(RELIABILITY_PATH):
    RELIABILITY_PATH = "data/processed/model_reliability_by_segment_usd.csv"
if not os.path.exists(RELIABILITY_PATH):
    RELIABILITY_PATH = "data/processed/model_reliability_by_segment.csv"

_reliability_df = None
if os.path.exists(RELIABILITY_PATH):
    _reliability_df = pd.read_csv(RELIABILITY_PATH)

# Load empirical out-of-fold log-residual quantiles (10th and 90th percentiles)
OOF_QUANTILES_PATH = "data/processed/oof_residual_quantiles_clean.json"
if not os.path.exists(OOF_QUANTILES_PATH):
    OOF_QUANTILES_PATH = "data/processed/oof_residual_quantiles_usd.json"
_oof_quantiles = None
if os.path.exists(OOF_QUANTILES_PATH):
    try:
        with open(OOF_QUANTILES_PATH, "r") as f:
            _oof_quantiles = json.load(f)
    except Exception:
        pass

# 95th percentiles derived from scope3_final_corrected_usd.csv training dataset
REVENUE_95TH_PERCENTILE_USD = 3.906e10  # ~$39.06B USD
SCOPE12_95TH_PERCENTILE_TCO2E = 2.250e7  # 22.5M tCO2e


def _get_revenue_quartile(revenue: Optional[float]) -> str:
    if revenue is None or revenue <= 0:
        return "Unknown / Not Disclosed"
    # Quartile cutoffs derived from USD training data (scope3_final_corrected_usd.csv)
    if revenue < 8.24e8:
        return "Small"
    elif revenue < 3.50e9:
        return "Mid-Small"
    elif revenue < 1.075e10:
        return "Mid-Large"
    else:
        return "Large"


def _lookup_segment_reliability(
    sector: str, jurisdiction: str, revenue: Optional[float]
) -> SegmentReliability:
    sector_r2 = 0.449  # default sector median (USD model)
    jurisdiction_r2 = 0.531  # default Other (USD model)
    rev_r2 = None
    historical_samples = 142

    rev_quartile = _get_revenue_quartile(revenue)

    if _reliability_df is not None:
        # Sector R2
        sec_match = _reliability_df[
            (_reliability_df["segment_type"] == "Sector")
            & (_reliability_df["segment"].str.lower() == sector.strip().lower())
        ]
        if not sec_match.empty:
            sector_r2 = float(sec_match.iloc[0]["r2"])
            historical_samples = int(sec_match.iloc[0]["n_companies"])

        # Jurisdiction R2
        jur_match = _reliability_df[
            (_reliability_df["segment_type"] == "Jurisdiction")
            & (_reliability_df["segment"].str.lower() == jurisdiction.strip().lower())
        ]
        if not jur_match.empty:
            jurisdiction_r2 = float(jur_match.iloc[0]["r2"])
        else:
            other_match = _reliability_df[
                (_reliability_df["segment_type"] == "Jurisdiction")
                & (_reliability_df["segment"] == "Other")
            ]
            if not other_match.empty:
                jurisdiction_r2 = float(other_match.iloc[0]["r2"])

        # Revenue quartile R2
        if rev_quartile in ["Small", "Mid-Small", "Mid-Large", "Large"]:
            rev_match = _reliability_df[
                (_reliability_df["segment_type"] == "Company Size (Revenue Quartile)")
                & (_reliability_df["segment"] == rev_quartile)
            ]
            if not rev_match.empty:
                rev_r2 = float(rev_match.iloc[0]["r2"])

    # Composite R2 is the unweighted arithmetic mean of available segments
    components = [sector_r2, jurisdiction_r2]
    if rev_r2 is not None:
        components.append(rev_r2)
    composite_r2 = round(float(np.mean(components)), 3)

    if composite_r2 >= 0.50:
        tier = "high"
    elif composite_r2 >= 0.35:
        tier = "medium"
    else:
        tier = "low"

    return SegmentReliability(
        sector=sector,
        sector_r2=round(sector_r2, 3),
        jurisdiction=jurisdiction,
        jurisdiction_r2=round(jurisdiction_r2, 3),
        revenue_quartile=rev_quartile,
        revenue_quartile_r2=round(rev_r2, 3) if rev_r2 is not None else None,
        composite_r2=composite_r2,
        historical_samples=historical_samples,
        reliability_tier=tier,
    )


def _build_feature_row(req: Scope3PredictionRequest) -> pd.DataFrame:
    has_financials = all(
        v is not None for v in [req.revenue, req.employees, req.market_cap, req.ebitda]
    )

    jurisdiction_simplified = (
        req.jurisdiction if req.jurisdiction in TOP_JURISDICTIONS else "Other"
    )

    row = {
        "log_scope1": np.log1p(req.scope_1),
        "log_scope2": np.log1p(req.scope_2),
        "log_revenue": np.log1p(req.revenue) if req.revenue is not None else np.nan,
        "log_employees": np.log1p(req.employees) if req.employees is not None else np.nan,
        "log_market_cap": np.log1p(req.market_cap) if req.market_cap is not None else np.nan,
        "log_ebitda": np.log1p(max(req.ebitda, 0)) if req.ebitda is not None else np.nan,
        "has_financials": int(has_financials),
        "sics_sector": req.sics_sector,
        "jurisdiction_simplified": jurisdiction_simplified,
    }
    return pd.DataFrame([row])


def _calculate_single_prediction(req: Scope3PredictionRequest) -> Scope3PredictionResponse:
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="No trained model found. Check ml/model_artifacts/.",
        )

    X = _build_feature_row(req)

    try:
        log_pred = float(_model.predict(X)[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    predicted_scope3 = float(np.expm1(log_pred))

    # Segment reliability lookup
    seg_rel = _lookup_segment_reliability(req.sics_sector, req.jurisdiction, req.revenue)

    # Compute honest 80% prediction interval using empirical out-of-fold log-residual quantiles
    # (10th and 90th percentiles derived from 5-fold cross-validation on scope3_final_corrected_usd.csv)
    q10 = -2.4160
    q90 = 2.2181
    interval_cohort = "overall sample"

    if _oof_quantiles:
        sec_q = _oof_quantiles.get("by_sector", {}).get(req.sics_sector)
        if sec_q:
            q10 = float(sec_q["q10"])
            q90 = float(sec_q["q90"])
            interval_cohort = f"matching sector: {req.sics_sector}"
        elif "overall" in _oof_quantiles:
            q10 = float(_oof_quantiles["overall"]["q10"])
            q90 = float(_oof_quantiles["overall"]["q90"])

    ci_lower = max(0.0, float(np.expm1(log_pred + q10)))
    ci_upper = float(np.expm1(log_pred + q90))
    interval_method = f"10th and 90th percentile of out-of-fold log-residuals in {interval_cohort} (80% empirical prediction interval)"

    used_real_financials = all(
        v is not None for v in [req.revenue, req.employees, req.market_cap, req.ebitda]
    )

    # Large-company extrapolation check against 95th percentiles of training data
    s12_sum = (req.scope_1 or 0.0) + (req.scope_2 or 0.0)
    is_large_revenue = (req.revenue is not None and req.revenue > REVENUE_95TH_PERCENTILE_USD)
    is_large_emissions = (s12_sum > SCOPE12_95TH_PERCENTILE_TCO2E)
    extrapolation_warning = bool(is_large_revenue or is_large_emissions)

    extrapolation_note = None
    if extrapolation_warning:
        extrapolation_note = (
            "This company exceeds the 95th percentile of training data (revenue > $39.1B or Scope 1+2 > 22.5M tCO2e). "
            "Very large emitters (revenue above about USD 100 billion) are systematically under-predicted (see independent validation)."
        )

    # Check if any matched segment R2 is below 0.1
    sub_10_segments = []
    if seg_rel.sector_r2 < 0.1:
        sub_10_segments.append(f"sector '{seg_rel.sector}' (R² = {seg_rel.sector_r2:.3f})")
    if seg_rel.jurisdiction_r2 < 0.1:
        sub_10_segments.append(f"jurisdiction '{seg_rel.jurisdiction}' (R² = {seg_rel.jurisdiction_r2:.3f})")
    if seg_rel.revenue_quartile_r2 is not None and seg_rel.revenue_quartile_r2 < 0.1:
        sub_10_segments.append(f"revenue quartile '{seg_rel.revenue_quartile}' (R² = {seg_rel.revenue_quartile_r2:.3f})")

    no_better_than_average = bool(len(sub_10_segments) > 0)
    no_better_than_average_note = None
    if no_better_than_average:
        segments_str = ", ".join(sub_10_segments)
        no_better_than_average_note = (
            f"Model accuracy for matched {segments_str} is below 0.10. "
            f"Predictions for this group are statistically no better than using the group average."
        )

    tier = seg_rel.reliability_tier
    components_str = f"sector R² = {seg_rel.sector_r2:.3f}, jurisdiction R² = {seg_rel.jurisdiction_r2:.3f}"
    if seg_rel.revenue_quartile_r2 is not None:
        components_str += f", revenue quartile R² = {seg_rel.revenue_quartile_r2:.3f}"

    if no_better_than_average:
        reliability_note = (
            f"No better than the average for this group (composite R² = {seg_rel.composite_r2:.3f}; "
            f"{no_better_than_average_note})."
        )
    else:
        reliability_note = (
            f"{tier.capitalize()} segment reliability (composite R² = {seg_rel.composite_r2:.3f}, "
            f"unweighted mean of {components_str})."
        )

    missing_financials_warning = not used_real_financials
    missing_financials_note = None
    if missing_financials_warning:
        missing_financials_note = (
            "Financials not entered: the forecast uses typical values for companies without financials "
            "and is less reliable."
        )

    return Scope3PredictionResponse(
        company_name=req.company_name,
        predicted_scope3_tco2e=round(predicted_scope3, 2),
        ci_lower_tco2e=round(ci_lower, 2),
        ci_upper_tco2e=round(ci_upper, 2),
        confidence_interval_level="80% Prediction Interval",
        used_real_financials=used_real_financials,
        missing_financials_warning=missing_financials_warning,
        missing_financials_note=missing_financials_note,
        has_financials_zero_r2=0.489,
        has_financials_zero_mae=1.625,
        segment_reliability=seg_rel,
        reliability_tier=tier,
        reliability_note=reliability_note,
        no_better_than_average=no_better_than_average,
        no_better_than_average_note=no_better_than_average_note,
        extrapolation_warning=extrapolation_warning,
        extrapolation_note=extrapolation_note,
        interval_method=interval_method,
    )


@router.post("/predict/scope3", response_model=Scope3PredictionResponse)
def predict_scope3(req: Scope3PredictionRequest):
    return _calculate_single_prediction(req)


@router.post("/predict/scope3/batch", response_model=BatchScope3PredictionResponse)
async def predict_scope3_batch(file: Optional[UploadFile] = File(None)):
    """
    Batch Scope 3 prediction via CSV file upload.
    Expects columns: company_name, scope_1, scope_2, sics_sector, jurisdiction,
    and optional: revenue, employees, market_cap, ebitda.
    """
    if file is None:
        raise HTTPException(status_code=400, detail="CSV file upload required.")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    required_cols = ["company_name", "scope_1", "scope_2", "sics_sector", "jurisdiction"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing required columns: {missing}. Found: {list(df.columns)}",
        )

    predictions: List[Scope3PredictionResponse] = []
    total_scope3 = 0.0
    r2_sum = 0.0
    sector_summary = {}

    for _, row in df.iterrows():
        try:
            req = Scope3PredictionRequest(
                company_name=str(row["company_name"]),
                scope_1=float(row["scope_1"]),
                scope_2=float(row["scope_2"]),
                sics_sector=str(row["sics_sector"]),
                jurisdiction=str(row["jurisdiction"]),
                revenue=float(row["revenue"]) if "revenue" in row and pd.notna(row["revenue"]) and float(row["revenue"]) > 0 else None,
                employees=float(row["employees"]) if "employees" in row and pd.notna(row["employees"]) and float(row["employees"]) > 0 else None,
                market_cap=float(row["market_cap"]) if "market_cap" in row and pd.notna(row["market_cap"]) and float(row["market_cap"]) > 0 else None,
                ebitda=float(row["ebitda"]) if "ebitda" in row and pd.notna(row["ebitda"]) else None,
            )
            pred = _calculate_single_prediction(req)
            predictions.append(pred)
            total_scope3 += pred.predicted_scope3_tco2e
            r2_sum += pred.segment_reliability.composite_r2

            sec = pred.segment_reliability.sector
            if sec not in sector_summary:
                sector_summary[sec] = {"count": 0, "total_scope3": 0.0, "avg_r2": 0.0}
            sector_summary[sec]["count"] += 1
            sector_summary[sec]["total_scope3"] += pred.predicted_scope3_tco2e
            sector_summary[sec]["avg_r2"] += pred.segment_reliability.composite_r2
        except Exception as e:
            # Skip invalid row or log error
            continue

    if not predictions:
        raise HTTPException(status_code=400, detail="No valid company records could be processed from CSV.")

    avg_r2 = round(r2_sum / len(predictions), 3)

    for sec in sector_summary:
        cnt = sector_summary[sec]["count"]
        sector_summary[sec]["avg_r2"] = round(sector_summary[sec]["avg_r2"] / cnt, 3)
        sector_summary[sec]["total_scope3"] = round(sector_summary[sec]["total_scope3"], 2)

    return BatchScope3PredictionResponse(
        total_companies=len(predictions),
        total_predicted_scope3_tco2e=round(total_scope3, 2),
        average_segment_r2=avg_r2,
        predictions=predictions,
        sector_summary=sector_summary,
    )
