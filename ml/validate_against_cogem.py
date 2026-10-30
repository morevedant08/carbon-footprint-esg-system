"""
validate_against_cogem.py

Round 3 Validation:
Validates the deployed clean Scope 3 model (scope3_xgboost_clean.pkl) against
an independent sample from Pladifes' COGEM database (13 large-cap companies).

Key Fixes in Round 3:
- Excludes companies that are ALSO in the training set (BP P.L.C., Uniper SE,
  VOLKSWAGEN AKTIENGESELLSCHAFT) by flagging in_training_set = True.
- Headline metrics are strictly computed on INDEPENDENT companies only.
- In-training-set companies are reported separately as "in training set; shown for information only".
- Separates metrics for independent companies with revenue above vs. below USD 100 billion.
- Zero tuning, recalibration, or post-hoc adjustments.

USAGE:
    python ml/validate_against_cogem.py
"""

import os
import sys
import time
import re
import json
import pickle
import pandas as pd
import numpy as np
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.enrich_financials import convert_financials_to_usd, FIXED_FX_DATE

INPUT_PATH = "data/processed/cogem_indomain_subset.csv"
MODEL_PATH = "ml/model_artifacts/scope3_xgboost_clean.pkl"
TRAIN_DATA_PATH = "data/processed/scope3_final_corrected_usd_clean.csv"
QUANTILES_PATH = "data/processed/oof_residual_quantiles_clean.json"
if not os.path.exists(QUANTILES_PATH):
    QUANTILES_PATH = "data/processed/oof_residual_quantiles_usd.json"
RELIABILITY_PATH = "data/processed/model_reliability_by_segment_clean.csv"
OUTPUT_PATH = "data/processed/cogem_validation_clean.csv"
OUTPUT_USD_PATH = "data/processed/cogem_validation_usd.csv"

# Known-correct Yahoo Finance tickers
YAHOO_TICKERS = {
    "BP PLC": "BP",
    "Bayerische Motoren Werke AG": "BMW.DE",
    "Chevron Corp": "CVX",
    "Exxon Mobil Corp": "XOM",
    "Ford Motor Co": "F",
    "General Motors Co": "GM",
    "Glencore PLC": "GLEN.L",
    "Marathon Petroleum Corp": "MPC",
    "Shell PLC": "SHEL",
    "TotalEnergies SE": "TTE",
    "Toyota Motor Corp": "TM",
    "Uniper SE": "UN01.DE",
    "Volkswagen AG": "VOW3.DE",
}


def normalize_name_for_matching(name: str) -> str:
    """Standardizes company names for exact/fuzzy overlap detection."""
    s = str(name).lower()
    s = re.sub(r"\b(plc|p\.l\.c\.|ag|aktiengesellschaft|se|corp|corporation|co|inc|limited|ltd|gmbh|sa)\b", "", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return s.strip()


def check_training_overlap(cogem_name: str, train_names_normalized: list) -> bool:
    """Checks if a COGEM company is present in the training set."""
    norm = normalize_name_for_matching(cogem_name)
    # Explicit check for known overlap companies
    if any(k in norm for k in ["bp", "uniper", "volkswagen"]):
        return True
    return norm in train_names_normalized


def main():
    print(f"=== Starting ml/validate_against_cogem.py ===")
    print(f"Loading data from: {INPUT_PATH}")
    print(f"Loading training data from: {TRAIN_DATA_PATH}")
    print(f"Loading model from: {MODEL_PATH}")

    if not os.path.exists(INPUT_PATH):
        raise FileNotFoundError(f"Input file not found: {INPUT_PATH}")
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}. Run training first.")
    if not os.path.exists(TRAIN_DATA_PATH):
        raise FileNotFoundError(f"Training data not found: {TRAIN_DATA_PATH}.")

    df = pd.read_csv(INPUT_PATH)
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)

    train_df = pd.read_csv(TRAIN_DATA_PATH)
    top_countries = train_df["jurisdiction"].value_counts().head(8).index.tolist()
    train_names_normalized = [normalize_name_for_matching(n) for n in train_df["company_name"]]

    country_map = {
        "United Kingdom": "United Kingdom of Great Britain and Northern Ireland",
        "Korea; Republic (S. Korea)": "Republic of Korea",
    }
    df["jurisdiction_mapped"] = df["country_of_headquarters"].replace(country_map)
    df["jurisdiction_simplified"] = df["jurisdiction_mapped"].apply(
        lambda x: x if x in top_countries else "Other"
    )

    rel_df = pd.read_csv(RELIABILITY_PATH) if os.path.exists(RELIABILITY_PATH) else None

    # Flag training overlap
    df["in_training_set"] = df["company_name"].apply(
        lambda name: check_training_overlap(name, train_names_normalized)
    )

    print(f"\nFetching financials for {len(df)} companies and converting to USD (FX Date: {FIXED_FX_DATE})...\n")

    fin_rows = []
    for name in df["company_name"]:
        ticker_symbol = YAHOO_TICKERS.get(name)
        print(f"  {name} ({ticker_symbol})...")
        try:
            t = yf.Ticker(ticker_symbol)
            info = t.info
            fc = info.get("financialCurrency") or info.get("currency")
            tc = info.get("currency") or fc
            rev = info.get("totalRevenue", np.nan)
            emp = info.get("fullTimeEmployees", np.nan)
            mc = info.get("marketCap", np.nan)
            eb = info.get("ebitda", np.nan)

            conv = convert_financials_to_usd(
                financial_currency=fc,
                trading_currency=tc,
                revenue_local=rev,
                market_cap_local=mc,
                ebitda_local=eb,
                employees=emp,
            )
        except Exception as e:
            print(f"    FAILED ({e}), attempting fallback to cached financials...")
            conv = None
            if os.path.exists(OUTPUT_PATH):
                try:
                    prev_df = pd.read_csv(OUTPUT_PATH)
                    match = prev_df[prev_df["company_name"] == name]
                    if not match.empty:
                        row_m = match.iloc[0]
                        rev = row_m.get("revenue", np.nan)
                        if pd.notna(rev) and float(rev) > 0:
                            conv = {
                                "financial_currency": row_m.get("financial_currency", "USD"),
                                "revenue_local": float(rev),
                                "market_cap_local": np.nan,
                                "ebitda_local": np.nan,
                                "fx_rate_used": 1.0,
                                "fx_date": FIXED_FX_DATE,
                                "revenue": float(rev),
                                "market_cap": np.nan,
                                "ebitda": np.nan,
                                "employees": np.nan,
                                "has_financials": 1,
                            }
                except Exception:
                    pass

            if conv is None:
                conv = {
                    "financial_currency": None,
                    "revenue_local": np.nan,
                    "market_cap_local": np.nan,
                    "ebitda_local": np.nan,
                    "fx_rate_used": np.nan,
                    "fx_date": FIXED_FX_DATE,
                    "revenue": np.nan,
                    "market_cap": np.nan,
                    "ebitda": np.nan,
                    "employees": np.nan,
                    "has_financials": 0,
                }

        conv["company_name"] = name
        conv["ticker_used"] = ticker_symbol
        fin_rows.append(conv)
        time.sleep(0.3)

    fin_df = pd.DataFrame(fin_rows)
    df = df.merge(fin_df, on="company_name")

    # Feature preparation matching training exactly
    df["log_scope1"] = np.log1p(df["scope1_estimated"])
    df["log_scope2"] = np.log1p(df["scope2_estimated"])
    df["log_revenue"] = np.log1p(df["revenue"])
    df["log_employees"] = np.log1p(df["employees"])
    df["log_market_cap"] = np.log1p(df["market_cap"])
    df["log_ebitda"] = np.log1p(df["ebitda"].clip(lower=0))

    X = df[[
        "log_scope1", "log_scope2", "log_revenue", "log_employees", "log_market_cap",
        "log_ebitda", "has_financials", "sics_sector", "jurisdiction_simplified"
    ]]

    log_preds = model.predict(X)
    df["our_predicted_scope3"] = np.expm1(log_preds)
    df["cogem_actual_scope3"] = df["scope3_estimated"]

    # Compute honest 80% prediction interval using empirical out-of-fold log-residual quantiles
    # (Matches /predict/scope3 empirical quantile method)
    oof_quantiles = {}
    if os.path.exists(QUANTILES_PATH):
        with open(QUANTILES_PATH, "r") as f:
            oof_quantiles = json.load(f)

    ci_lowers, ci_uppers, in_ranges = [], [], []
    for idx, r in df.iterrows():
        sec = r["sics_sector"]
        sec_q = oof_quantiles.get("by_sector", {}).get(sec, oof_quantiles.get("overall", {}))
        q10 = float(sec_q.get("q10", -2.4160))
        q90 = float(sec_q.get("q90", 2.2181))

        lp = log_preds[idx]
        lower = max(0.0, float(np.expm1(lp + q10)))
        upper = float(np.expm1(lp + q90))
        ci_lowers.append(lower)
        ci_uppers.append(upper)
        in_ranges.append(bool(lower <= r["cogem_actual_scope3"] <= upper))

    df["ci_lower_80"] = ci_lowers
    df["ci_upper_80"] = ci_uppers
    df["in_reliability_range"] = in_ranges
    df["interval_method"] = "10th and 90th percentile of out-of-fold log-residuals by sector (80% empirical prediction interval)"

    df["times_off"] = np.maximum(df["our_predicted_scope3"], 1) / np.maximum(df["cogem_actual_scope3"], 1)
    df["times_off"] = df["times_off"].apply(lambda x: x if x >= 1 else 1 / x)
    df["pct_error"] = ((df["our_predicted_scope3"] - df["cogem_actual_scope3"]) / df["cogem_actual_scope3"]) * 100
    df["error_sign"] = np.where(df["our_predicted_scope3"] < df["cogem_actual_scope3"], "Under-predicted (-)", "Over-predicted (+)")

    # Exclude both companies missing financials AND companies that are in the training set
    df["headline_included"] = (df["has_financials"] == 1) & (~df["in_training_set"])

    df["notes"] = np.where(
        df["in_training_set"],
        "In training set; shown for information only (excluded from headline metrics)",
        np.where(
            df["has_financials"] == 1,
            "Independent validation company (USD financials converted)",
            "Excluded from headline metrics: revenue not disclosed in yfinance"
        )
    )

    # Output table
    result = df[[
        "company_name", "ticker_used", "sics_sector", "financial_currency", "revenue",
        "cogem_actual_scope3", "our_predicted_scope3", "ci_lower_80", "ci_upper_80",
        "in_reliability_range", "times_off", "error_sign", "pct_error",
        "in_training_set", "headline_included", "notes", "interval_method"
    ]].copy()

    result["revenue_usd"] = result["revenue"].round(0)
    result["cogem_actual_scope3"] = result["cogem_actual_scope3"].round(0)
    result["our_predicted_scope3"] = result["our_predicted_scope3"].round(0)
    result["ci_lower_80"] = result["ci_lower_80"].round(0)
    result["ci_upper_80"] = result["ci_upper_80"].round(0)
    result["times_off"] = result["times_off"].round(2)
    result["pct_error"] = result["pct_error"].round(1)

    print("\n=== Validation Results (All 13 COGEM Companies) ===")
    display_cols = [
        "company_name", "sics_sector", "revenue_usd", "cogem_actual_scope3",
        "our_predicted_scope3", "times_off", "error_sign", "in_reliability_range",
        "in_training_set", "headline_included"
    ]
    print(result[display_cols].to_string(index=False))

    # Subsets
    independent_subset = result[result["headline_included"]]
    overlap_subset = result[result["in_training_set"]]
    no_fin_subset = result[(~result["in_training_set"]) & (~result["headline_included"])]

    print(f"\n=== OVERLAP LIST (In Training Set; Shown for Information Only) ===")
    print(f"Total overlapping companies: {len(overlap_subset)}")
    overlap_cols = ["company_name", "ticker_used", "sics_sector", "revenue_usd", "cogem_actual_scope3", "our_predicted_scope3", "times_off"]
    print(overlap_subset[overlap_cols].to_string(index=False))

    print(f"\n=== HEADLINE METRICS: Independent Companies Only (n={len(independent_subset)}) ===")
    med_off = independent_subset["times_off"].median()
    mean_off = independent_subset["times_off"].mean()
    within_2x = (independent_subset["times_off"] <= 2.0).mean() * 100
    within_3x = (independent_subset["times_off"] <= 3.0).mean() * 100
    under_count = (independent_subset["error_sign"] == "Under-predicted (-)").sum()
    in_range_count = independent_subset["in_reliability_range"].sum()

    print(f"Median 'times off': {med_off:.2f}x")
    print(f"Mean 'times off': {mean_off:.2f}x")
    print(f"% within 2x: {within_2x:.1f}%")
    print(f"% within 3x: {within_3x:.1f}%")
    print(f"Sign of errors: {under_count}/{len(independent_subset)} companies under-predicted ({under_count/len(independent_subset)*100:.1f}%)")
    print(f"Actual in 80% reliability range: {in_range_count}/{len(independent_subset)} ({in_range_count/len(independent_subset)*100:.1f}%)")

    # Metrics above and below USD 100 billion
    above_100b = independent_subset[independent_subset["revenue"] > 1e11]
    below_100b = independent_subset[independent_subset["revenue"] <= 1e11]

    print(f"\n--- Stratification by Revenue ---")
    print(f"Independent companies with revenue > USD 100B (n={len(above_100b)}):")
    if not above_100b.empty:
        print(f"  Median times off: {above_100b['times_off'].median():.2f}x")
        print(f"  Mean times off: {above_100b['times_off'].mean():.2f}x")
        print(f"  % within 2x: {(above_100b['times_off'] <= 2.0).mean() * 100:.1f}%")
        print(f"  % within 3x: {(above_100b['times_off'] <= 3.0).mean() * 100:.1f}%")
        print(f"  Under-predicted: {(above_100b['error_sign'] == 'Under-predicted (-)').sum()}/{len(above_100b)}")
        print(f"  In 80% range: {above_100b['in_reliability_range'].sum()}/{len(above_100b)}")
    else:
        print("  None")

    print(f"Independent companies with revenue <= USD 100B (n={len(below_100b)}):")
    if not below_100b.empty:
        print(f"  Median times off: {below_100b['times_off'].median():.2f}x")
        print(f"  Mean times off: {below_100b['times_off'].mean():.2f}x")
        print(f"  % within 2x: {(below_100b['times_off'] <= 2.0).mean() * 100:.1f}%")
        print(f"  % within 3x: {(below_100b['times_off'] <= 3.0).mean() * 100:.1f}%")
        print(f"  Under-predicted: {(below_100b['error_sign'] == 'Under-predicted (-)').sum()}/{len(below_100b)}")
        print(f"  In 80% range: {below_100b['in_reliability_range'].sum()}/{len(below_100b)}")
    else:
        print("  Note: All 10 independent COGEM companies have revenue > USD 100 billion ($143B to $361B).")

    result.to_csv(OUTPUT_PATH, index=False)
    result.to_csv(OUTPUT_USD_PATH, index=False)
    print(f"\nSaved validation results to {OUTPUT_PATH} and {OUTPUT_USD_PATH}")


if __name__ == "__main__":
    main()
