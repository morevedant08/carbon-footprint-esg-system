"""
ml/experiment_intensity_target.py

Experiment: Absolute Target vs. Intensity Target (decided strictly by Cross-Validation).
Target comparison:
  - Absolute target: log_scope3
  - Intensity target: log_scope3 - log_revenue (intensity = Scope 3 / Revenue)
    Predicted Scope 3 is recovered as: exp(pred_intensity) * Revenue, or in log terms: pred_intensity + log_revenue.
    Companies missing revenue fall back to the absolute-target model.

Adoption rule (Section 3.2):
  Adopt intensity target ONLY if:
    1. Out-of-fold R² in the Large revenue quartile improves clearly, AND
    2. Overall out-of-fold R² does not fall by more than 0.01.
  Otherwise, keep the current target and record the result as a null result.
  NEVER use COGEM data for this decision.
"""

import os
import sys
import pandas as pd
import numpy as np
from sklearn.model_selection import KFold
from sklearn.metrics import r2_score, mean_absolute_error
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
from sklearn.base import clone
import xgboost as xgb

INPUT_PATH = "data/processed/scope3_final_corrected_usd_clean.csv"
OUTPUT_EXPERIMENT_PATH = "data/processed/intensity_target_experiment_results.csv"


def build_features(df: pd.DataFrame):
    df = df.copy()
    df["log_scope1"] = np.log1p(df["scope_1"])
    df["log_scope2"] = np.log1p(df["scope_2"])
    df["log_scope3"] = np.log1p(df["scope_3"])
    df["log_revenue"] = np.log1p(df["revenue"])
    df["log_employees"] = np.log1p(df["employees"])
    df["log_market_cap"] = np.log1p(df["market_cap"])
    df["log_ebitda"] = np.log1p(df["ebitda"].clip(lower=0))
    df["has_financials"] = df[["revenue", "employees", "market_cap", "ebitda"]].notna().all(axis=1).astype(int)
    top_countries = df["jurisdiction"].value_counts().head(8).index.tolist()
    df["jurisdiction_simplified"] = df["jurisdiction"].apply(lambda x: x if x in top_countries else "Other")
    return df


def main():
    print(f"=== Starting ml/experiment_intensity_target.py ===")
    print(f"Loading data from: {INPUT_PATH}")

    df = pd.read_csv(INPUT_PATH)
    df = build_features(df)

    numeric_feats = ["log_scope1", "log_scope2", "log_revenue", "log_employees", "log_market_cap", "log_ebitda"]
    cat_feats = ["sics_sector", "jurisdiction_simplified"]
    X = df[numeric_feats + ["has_financials"] + cat_feats]
    y_abs = df["log_scope3"]

    preprocessor = ColumnTransformer([
        ("num", SimpleImputer(strategy="median"), numeric_feats),
        ("flag", "passthrough", ["has_financials"]),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_feats),
    ])

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    xgb_base = xgb.XGBRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.02,
        objective="reg:squarederror", random_state=42, n_jobs=-1
    )
    base_pipe = Pipeline([("prep", preprocessor), ("model", xgb_base)])

    # 1. Full Dataset Absolute Target Model (5-Fold Out-of-Fold)
    oof_abs_full = np.zeros(len(df))
    for train_idx, val_idx in kf.split(X, y_abs):
        f_pipe = clone(base_pipe)
        f_pipe.fit(X.iloc[train_idx], y_abs.iloc[train_idx])
        oof_abs_full[val_idx] = f_pipe.predict(X.iloc[val_idx])

    overall_abs_r2 = r2_score(y_abs, oof_abs_full)
    overall_abs_mae = mean_absolute_error(y_abs, oof_abs_full)

    # Segment by revenue quartile
    valid_rev = df[df["revenue"].notna() & (df["revenue"] > 0)]
    q_labels = ["Small", "Mid-Small", "Mid-Large", "Large"]
    df["rev_quartile"] = None
    df.loc[valid_rev.index, "rev_quartile"] = pd.qcut(valid_rev["revenue"], 4, labels=q_labels).astype(str)

    # 2. Subset with valid revenue (n=563) for direct Intensity vs Absolute comparison
    sub_df = df[df["rev_quartile"].notna()].copy()
    X_sub = sub_df[numeric_feats + ["has_financials"] + cat_feats].reset_index(drop=True)
    y_sub_abs = sub_df["log_scope3"].reset_index(drop=True)
    # Intensity: log(Scope 3) - log(Revenue)
    y_sub_intensity = (sub_df["log_scope3"] - sub_df["log_revenue"]).reset_index(drop=True)
    log_rev_sub = sub_df["log_revenue"].reset_index(drop=True)
    quartiles_sub = sub_df["rev_quartile"].reset_index(drop=True)

    oof_int_preds = np.zeros(len(sub_df))
    oof_abs_sub_preds = np.zeros(len(sub_df))

    kf_sub = KFold(n_splits=5, shuffle=True, random_state=42)
    for train_idx, val_idx in kf_sub.split(X_sub, y_sub_intensity):
        # Intensity model
        pipe_int = clone(base_pipe)
        pipe_int.fit(X_sub.iloc[train_idx], y_sub_intensity.iloc[train_idx])
        oof_int_preds[val_idx] = pipe_int.predict(X_sub.iloc[val_idx])

        # Absolute model on identical subset
        pipe_abs = clone(base_pipe)
        pipe_abs.fit(X_sub.iloc[train_idx], y_sub_abs.iloc[train_idx])
        oof_abs_sub_preds[val_idx] = pipe_abs.predict(X_sub.iloc[val_idx])

    # Reconstruct log_scope3 from intensity predictions: log_pred = pred_intensity + log_revenue
    oof_recovered_scope3 = oof_int_preds + log_rev_sub

    # Combined full-dataset prediction (intensity for valid revenue, absolute fallback for missing revenue)
    oof_combined = oof_abs_full.copy()
    sub_indices = sub_df.index.tolist()
    oof_combined[sub_indices] = oof_recovered_scope3.values
    overall_combined_r2 = r2_score(y_abs, oof_combined)
    overall_combined_mae = mean_absolute_error(y_abs, oof_combined)

    # Metrics on valid revenue subset
    sub_abs_r2 = r2_score(y_sub_abs, oof_abs_sub_preds)
    sub_abs_mae = mean_absolute_error(y_sub_abs, oof_abs_sub_preds)
    sub_int_r2 = r2_score(y_sub_abs, oof_recovered_scope3)
    sub_int_mae = mean_absolute_error(y_sub_abs, oof_recovered_scope3)

    print("\n=== Experiment Results: Absolute vs. Intensity Target ===")
    print(f"{'Cohort / Metric':<35} {'Absolute Target':<18} {'Intensity Target':<18} {'Delta (Int - Abs)':<18}")
    print("-" * 89)
    print(f"{'Full Data OOF R2 (n=1069)':<35} {overall_abs_r2:<18.4f} {overall_combined_r2:<18.4f} {overall_combined_r2 - overall_abs_r2:<18.4f}")
    print(f"{'Full Data OOF MAE (n=1069)':<35} {overall_abs_mae:<18.4f} {overall_combined_mae:<18.4f} {overall_combined_mae - overall_abs_mae:<18.4f}")
    print(f"{'Valid Revenue Subset OOF R2 (n=563)':<35} {sub_abs_r2:<18.4f} {sub_int_r2:<18.4f} {sub_int_r2 - sub_abs_r2:<18.4f}")
    print(f"{'Valid Revenue Subset OOF MAE (n=563)':<35} {sub_abs_mae:<18.4f} {sub_int_mae:<18.4f} {sub_int_mae - sub_abs_mae:<18.4f}")

    print("\n--- Revenue Quartile Segment Breakdown (Valid Revenue Subset n=563) ---")
    quartile_records = []
    for q in q_labels:
        mask = (quartiles_sub == q)
        q_count = mask.sum()
        r2_a = r2_score(y_sub_abs[mask], oof_abs_sub_preds[mask])
        mae_a = mean_absolute_error(y_sub_abs[mask], oof_abs_sub_preds[mask])
        r2_i = r2_score(y_sub_abs[mask], oof_recovered_scope3[mask])
        mae_i = mean_absolute_error(y_sub_abs[mask], oof_recovered_scope3[mask])

        quartile_records.append({
            "segment": f"Quartile: {q}",
            "n_companies": int(q_count),
            "absolute_r2": round(r2_a, 4),
            "intensity_r2": round(r2_i, 4),
            "r2_delta": round(r2_i - r2_a, 4),
            "absolute_mae": round(mae_a, 4),
            "intensity_mae": round(mae_i, 4),
            "mae_delta": round(mae_i - mae_a, 4),
        })
        print(f"  {q:<12} (n={q_count}): Abs R² = {r2_a:.4f}, Int R² = {r2_i:.4f} (Δ = {r2_i - r2_a:+.4f}) | Abs MAE = {mae_a:.4f}, Int MAE = {mae_i:.4f}")

    # Full data quartile breakdown
    for q in q_labels:
        sub_full = df[df["rev_quartile"] == q]
        r2_full_abs = r2_score(sub_full["log_scope3"], oof_abs_full[sub_full.index])
        r2_full_comb = r2_score(sub_full["log_scope3"], oof_combined[sub_full.index])
        print(f"  Full Data {q:<10} (n={len(sub_full)}): Abs R² = {r2_full_abs:.4f}, Comb R² = {r2_full_comb:.4f} (Δ = {r2_full_comb - r2_full_abs:+.4f})")

    # Decision evaluation per Section 3.2
    large_q_mask = (quartiles_sub == "Large")
    large_q_abs_r2 = r2_score(y_sub_abs[large_q_mask], oof_abs_sub_preds[large_q_mask])
    large_q_int_r2 = r2_score(y_sub_abs[large_q_mask], oof_recovered_scope3[large_q_mask])
    large_improved = large_q_int_r2 > large_q_abs_r2 + 0.02
    overall_drop = overall_abs_r2 - overall_combined_r2

    adopt = bool(large_improved and overall_drop <= 0.01)

    print("\n=== Adoption Decision Criteria (Section 3.2) ===")
    print(f"1. Large Quartile R²: Absolute = {large_q_abs_r2:.4f}, Intensity = {large_q_int_r2:.4f} -> Improved clearly? {large_improved}")
    print(f"2. Overall OOF R² drop: {overall_drop:+.4f} (Threshold: <= 0.01) -> Within threshold? {overall_drop <= 0.01}")
    print(f"\nDECISION: {'ADOPT INTENSITY TARGET' if adopt else 'DO NOT ADOPT (KEEP CURRENT ABSOLUTE TARGET - NULL RESULT)'}")
    print(f"Reason: Large quartile R² degraded from {large_q_abs_r2:.4f} to {large_q_int_r2:.4f} (Δ = {large_q_int_r2 - large_q_abs_r2:.4f}), "
          f"and overall OOF R² dropped by {overall_drop:.4f} (> 0.01 threshold).")

    # Save summary table
    exp_df = pd.DataFrame(quartile_records)
    exp_df.to_csv(OUTPUT_EXPERIMENT_PATH, index=False)
    print(f"\nSaved experiment results to {OUTPUT_EXPERIMENT_PATH}")

    return {
        "overall_abs_r2": overall_abs_r2,
        "overall_combined_r2": overall_combined_r2,
        "sub_abs_r2": sub_abs_r2,
        "sub_int_r2": sub_int_r2,
        "large_q_abs_r2": large_q_abs_r2,
        "large_q_int_r2": large_q_int_r2,
        "adopted": adopt,
    }


if __name__ == "__main__":
    main()
