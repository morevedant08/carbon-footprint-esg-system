"""
train_all_models.py

Comprehensive model comparison for Scope 3 emission prediction. Trains and
evaluates SEVEN different regression approaches on the same corrected
dataset with identical features and cross-validation scheme, for a fair,
publishable comparison.

Models compared:
    1. Linear Regression       - simple baseline
    2. Ridge Regression        - regularized linear baseline
    3. Random Forest           - bagged trees
    4. Extra Trees             - randomized bagged trees
    5. Gradient Boosting       - sklearn's boosted trees
    6. XGBoost                 - primary model (per README)
    7. LightGBM                - alternative boosting library (used by
                                  Pladifes/CGEE's own methodology paper)

USAGE:
    pip install scikit-learn xgboost lightgbm pandas numpy
    python ml/train_all_models.py

OUTPUT:
    - Prints a full comparison table (Test R², Test MAE, CV R² mean/std)
    - Saves data/processed/full_model_comparison.csv
    - Saves the single best-performing model as ml/model_artifacts/best_model.pkl
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, KFold
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, GradientBoostingRegressor
import pickle
import os
import time

INPUT_PATH = "data/processed/scope3_final_corrected_usd_clean.csv"
OUTPUT_PATH = "data/processed/full_model_comparison_clean.csv"
BEST_MODEL_PATH = "ml/model_artifacts/best_model_clean.pkl"
RELIABILITY_OUTPUT_PATH = "data/processed/model_reliability_by_segment_clean.csv"
XGB_MODEL_PATH = "ml/model_artifacts/scope3_xgboost_clean.pkl"
OOF_QUANTILES_PATH = "data/processed/oof_residual_quantiles_clean.json"


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


def get_models():
    models = {
        "Linear Regression": LinearRegression(),
        "Ridge Regression": Ridge(alpha=1.0, random_state=42),
        "Random Forest": RandomForestRegressor(n_estimators=200, max_depth=6, min_samples_leaf=3, random_state=42),
        "Extra Trees": ExtraTreesRegressor(n_estimators=200, max_depth=6, min_samples_leaf=3, random_state=42),
        "Gradient Boosting (sklearn)": GradientBoostingRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05, random_state=42
        ),
    }

    try:
        import xgboost as xgb
        models["XGBoost"] = xgb.XGBRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.02, objective="reg:squarederror",
            random_state=42, n_jobs=-1
        )
    except ImportError:
        print("WARNING: xgboost not installed - skipping. Run: pip install xgboost")

    try:
        import lightgbm as lgb
        models["LightGBM"] = lgb.LGBMRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42, verbose=-1
        )
    except ImportError:
        print("WARNING: lightgbm not installed - skipping. Run: pip install lightgbm")

    return models


def main():
    print(f"Loading data from: {INPUT_PATH}")
    df = pd.read_csv(INPUT_PATH)
    df = build_features(df)

    numeric_feats = ["log_scope1", "log_scope2", "log_revenue", "log_employees", "log_market_cap", "log_ebitda"]
    cat_feats = ["sics_sector", "jurisdiction_simplified"]
    X = df[numeric_feats + ["has_financials"] + cat_feats]
    y = df["log_scope3"]

    preprocessor = ColumnTransformer([
        ("num", SimpleImputer(strategy="median"), numeric_feats),
        ("flag", "passthrough", ["has_financials"]),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_feats),
    ])

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    kf = KFold(n_splits=5, shuffle=True, random_state=42)

    models = get_models()
    results = []
    fitted_pipelines = {}

    print(f"Comparing {len(models)} models on {len(df)} companies...\n")

    for name, model in models.items():
        start = time.time()
        pipe = Pipeline([("prep", preprocessor), ("model", model)])
        pipe.fit(X_train, y_train)
        preds = pipe.predict(X_test)

        test_r2 = r2_score(y_test, preds)
        test_mae = mean_absolute_error(y_test, preds)
        cv_scores = cross_val_score(pipe, X, y, cv=kf, scoring="r2")
        elapsed = time.time() - start

        results.append({
            "Model": name,
            "Test R2": round(test_r2, 4),
            "Test MAE": round(test_mae, 4),
            "CV R2 mean": round(cv_scores.mean(), 4),
            "CV R2 std": round(cv_scores.std(), 4),
            "Train time (s)": round(elapsed, 2),
        })
        fitted_pipelines[name] = pipe

        print(f"  {name}: CV R2 = {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})  [{elapsed:.1f}s]")

    results_df = pd.DataFrame(results).sort_values("CV R2 mean", ascending=False)
    print("\n=== Full Model Comparison (sorted by CV R2 mean) ===")
    print(results_df.to_string(index=False))

    os.makedirs("data/processed", exist_ok=True)
    os.makedirs("ml/model_artifacts", exist_ok=True)
    results_df.to_csv(OUTPUT_PATH, index=False)

    # Save the single best model (by CV R2 mean), refit on full data
    best_name = results_df.iloc[0]["Model"]
    best_pipe = fitted_pipelines[best_name]
    best_pipe.fit(X, y)
    with open(BEST_MODEL_PATH, "wb") as f:
        pickle.dump(best_pipe, f)
    print(f"\nBest model: {best_name} (CV R2 = {results_df.iloc[0]['CV R2 mean']:.4f})")
    print(f"Saved comparison table to {OUTPUT_PATH}")
    print(f"Saved best model to {BEST_MODEL_PATH}")

    # Also save the refit XGBoost model for deployment
    if "XGBoost" in fitted_pipelines:
        xgb_pipe = fitted_pipelines["XGBoost"]
        xgb_pipe.fit(X, y)
        with open(XGB_MODEL_PATH, "wb") as f:
            pickle.dump(xgb_pipe, f)
        print(f"Saved XGBoost model to {XGB_MODEL_PATH}")

    # ------------------------------------------------------------------
    # Segment Reliability (Out-of-fold evaluation on full dataset)
    # ------------------------------------------------------------------
    eval_model_name = "XGBoost" if "XGBoost" in fitted_pipelines else best_name
    print(f"\nComputing out-of-fold segment reliability using {eval_model_name}...")

    # Re-instantiate a clean pipeline for out-of-fold predictions
    from sklearn.base import clone
    eval_model = models.get(eval_model_name, best_pipe.named_steps["model"])
    oof_pipe = Pipeline([("prep", preprocessor), ("model", clone(eval_model))])

    oof_preds = np.zeros(len(df))
    for train_idx, val_idx in kf.split(X, y):
        fold_pipe = clone(oof_pipe)
        fold_pipe.fit(X.iloc[train_idx], y.iloc[train_idx])
        oof_preds[val_idx] = fold_pipe.predict(X.iloc[val_idx])

    df_rel = df.copy()
    df_rel["oof_pred"] = oof_preds
    df_rel["actual_log_scope3"] = y

    # Compute USD revenue quartiles for companies with valid revenue
    valid_rev = df_rel[df_rel["revenue"].notna() & (df_rel["revenue"] > 0)]["revenue"]
    q_labels = ["Small", "Mid-Small", "Mid-Large", "Large"]
    df_rel["rev_quartile"] = None
    df_rel.loc[valid_rev.index, "rev_quartile"] = pd.qcut(valid_rev, 4, labels=q_labels).astype(str)

    reliability_records = []

    # 1. Company Size (Revenue Quartile)
    for q in q_labels:
        sub = df_rel[df_rel["rev_quartile"] == q]
        if len(sub) > 1:
            r2_q = r2_score(sub["actual_log_scope3"], sub["oof_pred"])
            reliability_records.append({
                "segment_type": "Company Size (Revenue Quartile)",
                "segment": q,
                "r2": round(float(r2_q), 3),
                "n_companies": int(len(sub)),
            })

    # 2. Jurisdiction (Top 8 countries + Other)
    top_countries = df_rel["jurisdiction"].value_counts().head(8).index.tolist()
    for jur in top_countries:
        sub = df_rel[df_rel["jurisdiction"] == jur]
        if len(sub) > 1:
            r2_j = r2_score(sub["actual_log_scope3"], sub["oof_pred"])
            reliability_records.append({
                "segment_type": "Jurisdiction",
                "segment": jur,
                "r2": round(float(r2_j), 3),
                "n_companies": int(len(sub)),
            })

    sub_other = df_rel[~df_rel["jurisdiction"].isin(top_countries)]
    if len(sub_other) > 1:
        r2_o = r2_score(sub_other["actual_log_scope3"], sub_other["oof_pred"])
        reliability_records.append({
            "segment_type": "Jurisdiction",
            "segment": "Other",
            "r2": round(float(r2_o), 3),
            "n_companies": int(len(sub_other)),
        })

    # 3. Sector
    for sector in df_rel["sics_sector"].dropna().unique():
        sub = df_rel[df_rel["sics_sector"] == sector]
        if len(sub) > 1:
            r2_s = r2_score(sub["actual_log_scope3"], sub["oof_pred"])
            reliability_records.append({
                "segment_type": "Sector",
                "segment": sector,
                "r2": round(float(r2_s), 3),
                "n_companies": int(len(sub)),
            })

    rel_df = pd.DataFrame(reliability_records)
    rel_df.to_csv(RELIABILITY_OUTPUT_PATH, index=False)

    print("\n=== Segment Reliability (Out-of-Fold R²) ===")
    print(rel_df.to_string(index=False))
    print(f"\nSaved segment reliability to {RELIABILITY_OUTPUT_PATH}")

    # 4. Out-of-fold Residual Quantiles (10th and 90th percentiles for 80% prediction interval)
    import json
    residuals = df_rel["actual_log_scope3"] - df_rel["oof_pred"]
    quantiles_data = {
        "overall": {
            "q10": round(float(np.percentile(residuals, 10)), 4),
            "q90": round(float(np.percentile(residuals, 90)), 4),
            "n": int(len(residuals)),
        },
        "by_sector": {},
        "by_jurisdiction": {},
    }
    for sector in df_rel["sics_sector"].dropna().unique():
        sub_res = residuals[df_rel["sics_sector"] == sector]
        if len(sub_res) >= 10:
            quantiles_data["by_sector"][sector] = {
                "q10": round(float(np.percentile(sub_res, 10)), 4),
                "q90": round(float(np.percentile(sub_res, 90)), 4),
                "n": int(len(sub_res)),
            }
    for jur in df_rel["jurisdiction"].dropna().unique():
        sub_res = residuals[df_rel["jurisdiction"] == jur]
        if len(sub_res) >= 15:
            quantiles_data["by_jurisdiction"][jur] = {
                "q10": round(float(np.percentile(sub_res, 10)), 4),
                "q90": round(float(np.percentile(sub_res, 90)), 4),
                "n": int(len(sub_res)),
            }

    with open(OOF_QUANTILES_PATH, "w") as f:
        json.dump(quantiles_data, f, indent=2)
    print(f"Saved out-of-fold residual quantiles to {OOF_QUANTILES_PATH}")


if __name__ == "__main__":
    main()
