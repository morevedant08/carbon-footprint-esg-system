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
import logging
from typing import List, Optional

from backend.schemas.scope3_schema import (
    Scope3PredictionRequest,
    Scope3PredictionResponse,
    SegmentReliability,
    BatchScope3PredictionResponse,
)

logger = logging.getLogger("carbon_api.predict")
router = APIRouter()

CLEAN_MODEL_PATH = "ml/model_artifacts/scope3_xgboost_clean.pkl"
MODEL_CARD_PATH = "ml/model_artifacts/model_card.json"

_model = None
_model_error = None
_model_path_used = CLEAN_MODEL_PATH

try:
    if not os.path.exists(CLEAN_MODEL_PATH):
        raise FileNotFoundError(f"Clean Scope 3 model file not found at {CLEAN_MODEL_PATH}")
    with open(CLEAN_MODEL_PATH, "rb") as f:
        _model = pickle.load(f)
    print(f"Loaded Scope 3 model successfully from {CLEAN_MODEL_PATH}")
except Exception as e:
    _model_error = str(e)
    print(f"FATAL: Failed to load Scope 3 model from {CLEAN_MODEL_PATH}: {e}")

# Version check against model card
if os.path.exists(MODEL_CARD_PATH):
    try:
        import importlib.metadata
        with open(MODEL_CARD_PATH, "r") as f:
            _card = json.load(f)
        _cur_xgb = importlib.metadata.version("xgboost")
        _cur_skl = importlib.metadata.version("scikit-learn")
        _card_xgb = _card.get("xgboost_version")
        _card_skl = _card.get("scikit_learn_version")
        if _card_xgb and _cur_xgb != _card_xgb:
            print(f"WARNING: Installed xgboost version ({_cur_xgb}) differs from training version ({_card_xgb})")
        if _card_skl and _cur_skl != _card_skl:
            print(f"WARNING: Installed scikit-learn version ({_cur_skl}) differs from training version ({_card_skl})")
    except Exception as _card_err:
        print(f"Note: Could not verify package versions against model card: {_card_err}")

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

# Compute percentiles and revenue quartiles dynamically from training dataset
DATA_CLEAN_PATH = "data/processed/scope3_final_corrected_usd_clean.csv"

# Fallback defaults in case data file is unreadable
REVENUE_95TH_PERCENTILE_USD = 3.9229e+10
SCOPE12_95TH_PERCENTILE_TCO2E = 2.2503e+07
REV_Q1 = 8.5468e+8
REV_Q2 = 3.5422e+9
REV_Q3 = 1.0934e+10

if os.path.exists(DATA_CLEAN_PATH):
    try:
        _train_df = pd.read_csv(DATA_CLEAN_PATH)
        _valid_rev = _train_df["revenue"].dropna()
        _valid_rev = _valid_rev[_valid_rev > 0]
        if not _valid_rev.empty:
            REVENUE_95TH_PERCENTILE_USD = float(_valid_rev.quantile(0.95))
            REV_Q1 = float(_valid_rev.quantile(0.25))
            REV_Q2 = float(_valid_rev.quantile(0.50))
            REV_Q3 = float(_valid_rev.quantile(0.75))

        _s12 = (_train_df["scope_1"] + _train_df["scope_2"]).dropna()
        if not _s12.empty:
            SCOPE12_95TH_PERCENTILE_TCO2E = float(_s12.quantile(0.95))

        print(f"Dynamic startup thresholds computed from {DATA_CLEAN_PATH}:")
        print(f"  Revenue 95th Percentile: ${REVENUE_95TH_PERCENTILE_USD:,.2f} USD")
        print(f"  Scope 1+2 95th Percentile: {SCOPE12_95TH_PERCENTILE_TCO2E:,.2f} tCO2e")
        print(f"  Revenue Quartile cutoffs: Q1=${REV_Q1:,.2f}, Q2=${REV_Q2:,.2f}, Q3=${REV_Q3:,.2f} USD")
    except Exception as _th_err:
        print(f"Warning: Failed to compute dynamic percentiles from {DATA_CLEAN_PATH}: {_th_err}")


def _get_revenue_quartile(revenue: Optional[float]) -> str:
    if revenue is None or revenue <= 0:
        return "Unknown / Not Disclosed"
    if revenue < REV_Q1:
        return "Small"
    elif revenue < REV_Q2:
        return "Mid-Small"
    elif revenue < REV_Q3:
        return "Mid-Large"
    else:
        return "Large"


def _lookup_segment_reliability(
    sector: str, jurisdiction: str, revenue: Optional[float], has_financials: bool
) -> SegmentReliability:
    sector_r2 = 0.449  # default sector median (USD model)
    jurisdiction_r2 = 0.531  # default Other (USD model)
    rev_r2 = None
    historical_samples = 142

    rev_quartile = _get_revenue_quartile(revenue) if has_financials else "Unknown / Not Disclosed"

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

        # Revenue quartile R2 (only when full financials are used)
        if has_financials and rev_quartile in ["Small", "Mid-Small", "Mid-Large", "Large"]:
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


def _build_feature_row(req: Scope3PredictionRequest, used_real_financials: bool) -> pd.DataFrame:
    jurisdiction_simplified = (
        req.jurisdiction if req.jurisdiction in TOP_JURISDICTIONS else "Other"
    )

    if used_real_financials:
        log_rev = np.log1p(req.revenue)
        log_emp = np.log1p(req.employees)
        log_mc = np.log1p(req.market_cap)
        log_eb = np.log1p(max(req.ebitda, 0))
        has_fin = 1
    else:
        log_rev = np.nan
        log_emp = np.nan
        log_mc = np.nan
        log_eb = np.nan
        has_fin = 0

    row = {
        "log_scope1": np.log1p(req.scope_1),
        "log_scope2": np.log1p(req.scope_2),
        "log_revenue": log_rev,
        "log_employees": log_emp,
        "log_market_cap": log_mc,
        "log_ebitda": log_eb,
        "has_financials": has_fin,
        "sics_sector": req.sics_sector,
        "jurisdiction_simplified": jurisdiction_simplified,
    }
    return pd.DataFrame([row])


def _calculate_single_prediction(req: Scope3PredictionRequest) -> Scope3PredictionResponse:
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail=f"No trained model found or model failed to load. {_model_error or 'Check ml/model_artifacts/.'}",
        )

    # Check financials completeness
    fin_fields = {
        "revenue": req.revenue,
        "employees": req.employees,
        "market_cap": req.market_cap,
        "ebitda": req.ebitda,
    }
    provided_financials = [k for k, v in fin_fields.items() if v is not None]
    missing_financial_fields = [k for k, v in fin_fields.items() if v is None]

    used_real_financials = (len(provided_financials) == 4)
    partial_financials_warning = (0 < len(provided_financials) < 4)
    missing_financials_warning = (len(provided_financials) == 0)

    partial_financials_note = None
    if partial_financials_warning:
        missing_names = ", ".join(missing_financial_fields)
        provided_names = ", ".join(provided_financials)
        partial_financials_note = (
            f"Partial financials entered: missing {missing_names}. "
            f"The model only uses financials when all four fields (revenue, employees, market cap, EBITDA) are present, "
            f"so the supplied fields ({provided_names}) were not used and the forecast uses typical values for companies without financials."
        )

    missing_financials_note = None
    if missing_financials_warning:
        missing_financials_note = (
            "Financials not entered: the forecast uses typical values for companies without financials "
            "and is less reliable."
        )

    X = _build_feature_row(req, used_real_financials)

    try:
        log_pred = float(_model.predict(X)[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    predicted_scope3 = float(np.expm1(log_pred))

    # Segment reliability lookup: do not show revenue quartile reliability if financials were not used
    seg_rel = _lookup_segment_reliability(
        req.sics_sector, req.jurisdiction, req.revenue, has_financials=used_real_financials
    )

    # Compute honest 80% prediction interval using empirical out-of-fold log-residual quantiles
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
    interval_ratio = round(float(ci_upper / ci_lower), 1) if ci_lower > 0 else None

    # Large-company extrapolation check against dynamic 95th percentiles of training data
    s12_sum = (req.scope_1 or 0.0) + (req.scope_2 or 0.0)
    is_large_revenue = (req.revenue is not None and req.revenue > REVENUE_95TH_PERCENTILE_USD)
    is_large_emissions = (s12_sum > SCOPE12_95TH_PERCENTILE_TCO2E)
    extrapolation_warning = bool(is_large_revenue or is_large_emissions)

    extrapolation_note = None
    if extrapolation_warning:
        extrapolation_note = (
            f"This company exceeds the 95th percentile of training data (revenue > ${REVENUE_95TH_PERCENTILE_USD/1e9:.1f}B "
            f"or Scope 1+2 > {SCOPE12_95TH_PERCENTILE_TCO2E/1e6:.1f}M tCO2e). "
            f"Validation shows these companies are under-predicted by roughly 20 to 900 times."
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

    # Section 3.5: If company is above 95th percentile, force reliability tier to 'low'
    tier = seg_rel.reliability_tier
    if extrapolation_warning:
        tier = "low"
        seg_rel.reliability_tier = "low"

    components_str = f"sector R² = {seg_rel.sector_r2:.3f}, jurisdiction R² = {seg_rel.jurisdiction_r2:.3f}"
    if seg_rel.revenue_quartile_r2 is not None:
        components_str += f", revenue quartile R² = {seg_rel.revenue_quartile_r2:.3f}"

    if extrapolation_warning:
        reliability_note = (
            f"Low segment reliability due to large-company extrapolation (composite R² = {seg_rel.composite_r2:.3f}; "
            f"{extrapolation_note})"
        )
    elif no_better_than_average:
        reliability_note = (
            f"No better than the average for this group (composite R² = {seg_rel.composite_r2:.3f}; "
            f"{no_better_than_average_note})."
        )
    else:
        reliability_note = (
            f"{tier.capitalize()} segment reliability (composite R² = {seg_rel.composite_r2:.3f}, "
            f"unweighted mean of {components_str})."
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
        partial_financials_warning=partial_financials_warning,
        partial_financials_note=partial_financials_note,
        has_financials_zero_r2=0.489,
        has_financials_zero_mae=1.625,
        segment_reliability=seg_rel,
        reliability_tier=tier,
        reliability_note=reliability_note,
        no_better_than_average=no_better_than_average,
        no_better_than_average_note=no_better_than_average_note,
        extrapolation_warning=extrapolation_warning,
        extrapolation_note=extrapolation_note,
        interval_ratio=interval_ratio,
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
